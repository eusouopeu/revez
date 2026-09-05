import type { AppSettings, Contribution, Item, Purchase } from './types'
import { addMonths, monthsBetween, parseISODate, yearsBetween } from './dates'

/** Purchases for one item, sorted oldest first. */
function sortedPurchases(purchases: Purchase[], itemId: string): Purchase[] {
  return purchases
    .filter((p) => p.itemId === itemId)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Anchor date for the current replacement cycle: the last registered
 * purchase, or the estimated purchase date entered at item creation.
 */
export function lastCycleStart(item: Item, purchases: Purchase[]): Date | undefined {
  const history = sortedPurchases(purchases, item.id)
  const last = history[history.length - 1]
  if (last) return parseISODate(last.date)
  if (item.estimatedLastPurchaseDate) return parseISODate(item.estimatedLastPurchaseDate)
  return undefined
}

export function nextReplacementDate(item: Item, purchases: Purchase[]): Date | undefined {
  const start = lastCycleStart(item, purchases)
  if (!start) return undefined
  return addMonths(start, item.lifespanMonths)
}

function lastPaidPrice(item: Item, purchases: Purchase[]): number | undefined {
  const history = sortedPurchases(purchases, item.id)
  const last = history[history.length - 1]
  if (last) return last.unitPrice
  return item.estimatedLastPrice
}

/**
 * Linear regression (price ~ time in days) over the item's purchase
 * history, evaluated at `targetDate`. Used once an item has 4+ purchases,
 * per docs/PROVISIONING-METHODS.md.
 */
function projectByTrend(history: Purchase[], targetDate: Date): number {
  const x0 = parseISODate(history[0].date).getTime()
  const points = history.map((p) => ({
    x: (parseISODate(p.date).getTime() - x0) / 86_400_000, // days since first purchase
    y: p.unitPrice,
  }))
  const n = points.length
  const sumX = points.reduce((s, p) => s + p.x, 0)
  const sumY = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumXX - sumX * sumX
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const targetX = (targetDate.getTime() - x0) / 86_400_000
  return intercept + slope * targetX
}

/**
 * Projected unit price at the item's next replacement date.
 *
 * - manualTargetPrice always wins.
 * - 0-3 purchases: last known price compounded by the annual inflation rate.
 * - 4+ purchases: linear trend over price history, floored at the last paid
 *   price (never projects a drop from what was actually paid) and capped at
 *   1.5x the inflation-only projection (guards against an outlier trend).
 */
export function projectedPrice(
  item: Item,
  purchases: Purchase[],
  settings: Pick<AppSettings, 'annualInflationRate'>,
  today: Date,
): number | undefined {
  if (item.manualTargetPrice != null) return item.manualTargetPrice

  const targetDate = nextReplacementDate(item, purchases) ?? today
  const history = sortedPurchases(purchases, item.id)
  const basePrice = lastPaidPrice(item, purchases)
  if (basePrice == null) return undefined

  const anchorDate = lastCycleStart(item, purchases) ?? today
  const inflationProjection =
    basePrice * (1 + settings.annualInflationRate) ** Math.max(0, yearsBetween(anchorDate, targetDate))

  if (history.length < 4) return inflationProjection

  const trend = projectByTrend(history, targetDate)
  return Math.min(Math.max(trend, basePrice), inflationProjection * 1.5)
}

type ProvisioningSettings = Pick<AppSettings, 'annualInflationRate' | 'provisioningMethod'>

/**
 * Monthly amount to set aside for one item.
 *
 * - `per-item` (default): remaining cost divided by remaining months. An
 *   item due within a month (or overdue) provisions its full remaining cost
 *   that month — a spike, surfaced separately by `provisionBreakdown` so the
 *   dashboard total doesn't jump unexplained.
 * - `perpetual-average`: remaining cost divided by the item's full lifespan,
 *   for a stable number that underfunds items close to replacement.
 *
 * See docs/PROVISIONING-METHODS.md for the trade-offs between the two.
 */
export function monthlyProvision(
  item: Item,
  purchases: Purchase[],
  settings: ProvisioningSettings,
  today: Date,
): number | undefined {
  const targetDate = nextReplacementDate(item, purchases)
  const price = projectedPrice(item, purchases, settings, today)
  if (!targetDate || price == null) return undefined

  const totalCost = price * item.quantity
  if (settings.provisioningMethod === 'perpetual-average') {
    return totalCost / Math.max(1, item.lifespanMonths)
  }

  const monthsRemaining = Math.max(1, monthsBetween(today, targetDate))
  return totalCost / monthsRemaining
}

export function totalMonthly(
  items: Item[],
  purchases: Purchase[],
  settings: ProvisioningSettings,
  today: Date,
): number {
  return items
    .filter((i) => i.status === 'active')
    .reduce((sum, item) => sum + (monthlyProvision(item, purchases, settings, today) ?? 0), 0)
}

/**
 * Splits the total monthly provision into a stable "recurring" part and an
 * "urgent" part — items due within a month (or overdue), which under the
 * `per-item` method provision their entire remaining cost this month. Under
 * `perpetual-average` nothing is ever urgent by construction, so this always
 * returns `urgent: 0` for that method.
 */
export function provisionBreakdown(
  items: Item[],
  purchases: Purchase[],
  settings: ProvisioningSettings,
  today: Date,
): { recurring: number; urgent: number } {
  let recurring = 0
  let urgent = 0
  for (const item of items.filter((i) => i.status === 'active')) {
    const provision = monthlyProvision(item, purchases, settings, today)
    if (provision == null) continue
    const targetDate = nextReplacementDate(item, purchases)
    const isUrgent =
      settings.provisioningMethod !== 'perpetual-average' &&
      targetDate != null &&
      monthsBetween(today, targetDate) <= 1
    if (isUrgent) urgent += provision
    else recurring += provision
  }
  return { recurring, urgent }
}

/**
 * Total saved toward one item's next replacement: contributions logged
 * since the current cycle started (last purchase, or the estimated
 * purchase date entered at item creation). Registering a purchase moves
 * the cycle anchor forward, so contributions from a prior cycle stop
 * counting automatically.
 */
export function savedForItem(item: Item, purchases: Purchase[], contributions: Contribution[]): number {
  const cycleStart = lastCycleStart(item, purchases)
  return contributions
    .filter((c) => c.itemId === item.id && (!cycleStart || parseISODate(c.date).getTime() >= cycleStart.getTime()))
    .reduce((sum, c) => sum + c.amount, 0)
}

/** Full projected cost of the item's next replacement (price × quantity). */
export function targetCost(item: Item, purchases: Purchase[], settings: ProvisioningSettings, today: Date): number | undefined {
  const price = projectedPrice(item, purchases, settings, today)
  return price == null ? undefined : price * item.quantity
}

export interface MonthProjection {
  /** "YYYY-MM" */
  month: string
  total: number
}

/**
 * Projected replacement spend for each of the next `monthsAhead` calendar
 * months (this month included), bucketed by each active item's next
 * replacement date. Reveals concentration (several items due the same
 * month) that the urgency-sorted list doesn't show.
 */
export function projectionByMonth(
  items: Item[],
  purchases: Purchase[],
  settings: ProvisioningSettings,
  today: Date,
  monthsAhead = 12,
): MonthProjection[] {
  const buckets: MonthProjection[] = Array.from({ length: monthsAhead }, (_, i) => {
    const d = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), i)
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, total: 0 }
  })

  for (const item of items.filter((i) => i.status === 'active')) {
    const target = nextReplacementDate(item, purchases)
    if (!target) continue
    const cost = targetCost(item, purchases, settings, today)
    if (cost == null) continue
    const key = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`
    const bucket = buckets.find((b) => b.month === key)
    if (bucket) bucket.total += cost
  }

  return buckets
}

export type ItemUrgency = 'overdue' | 'due-soon' | 'ok' | 'unscheduled'

export function urgencyOf(item: Item, purchases: Purchase[], today: Date, reminderLeadDays: number): ItemUrgency {
  const targetDate = nextReplacementDate(item, purchases)
  if (!targetDate) return 'unscheduled'
  const daysLeft = (targetDate.getTime() - today.getTime()) / 86_400_000
  if (daysLeft < 0) return 'overdue'
  if (daysLeft <= reminderLeadDays) return 'due-soon'
  return 'ok'
}
