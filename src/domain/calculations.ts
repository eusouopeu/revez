import type { AppSettings, Contribution, Item, Postponement, Purchase } from './types'
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
  const iso = lastCycleStartISO(item, purchases)
  return iso ? parseISODate(iso) : undefined
}

function lastCycleStartISO(item: Item, purchases: Purchase[]): string | undefined {
  const history = sortedPurchases(purchases, item.id)
  return history[history.length - 1]?.date ?? item.estimatedLastPurchaseDate
}

/** Months the current cycle was postponed by; 0 once a newer purchase moved the anchor. */
export function activePostponementMonths(item: Item, purchases: Purchase[]): number {
  if (!item.postponement) return 0
  return item.postponement.cycleStart === lastCycleStartISO(item, purchases) ? item.postponement.months : 0
}

export function nextReplacementDate(item: Item, purchases: Purchase[]): Date | undefined {
  const start = lastCycleStart(item, purchases)
  if (!start) return undefined
  return addMonths(start, item.lifespanMonths + activePostponementMonths(item, purchases))
}

/**
 * Postponement that pushes the replacement date `months` past the current
 * date — or past today, when the item is already overdue, so "+1 mês" on
 * an item three months late still lands in the future.
 */
export function postponementFor(item: Item, purchases: Purchase[], today: Date, months: number): Postponement | undefined {
  const startISO = lastCycleStartISO(item, purchases)
  const target = nextReplacementDate(item, purchases)
  if (!startISO || !target) return undefined
  const start = parseISODate(startISO)
  const desired = addMonths(target.getTime() > today.getTime() ? target : today, months)
  let extra = activePostponementMonths(item, purchases)
  while (addMonths(start, item.lifespanMonths + extra).getTime() < desired.getTime()) extra++
  return { cycleStart: startISO, months: extra }
}

/** Average months between consecutive purchases, once there are at least two. */
export function observedLifespanMonths(item: Item, purchases: Purchase[]): number | undefined {
  const history = sortedPurchases(purchases, item.id)
  if (history.length < 2) return undefined
  const first = parseISODate(history[0].date)
  const last = parseISODate(history[history.length - 1].date)
  return monthsBetween(first, last) / (history.length - 1)
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

/**
 * How much should already be set aside for one item at `today`: its target
 * cost scaled by how far into the (possibly postponed) cycle we are.
 */
export function expectedSavedByNow(item: Item, purchases: Purchase[], settings: ProvisioningSettings, today: Date): number {
  const start = lastCycleStart(item, purchases)
  const target = nextReplacementDate(item, purchases)
  const goal = targetCost(item, purchases, settings, today)
  if (!start || !target || goal == null) return 0
  const cycle = monthsBetween(start, target)
  if (cycle <= 0) return goal
  return goal * Math.min(1, Math.max(0, monthsBetween(start, today) / cycle))
}

export interface ReserveSummary {
  saved: number
  expected: number
  goal: number
}

/** Totals across active items: saved this cycle, expected by now, and full replacement cost. */
export function reserveSummary(
  items: Item[],
  purchases: Purchase[],
  contributions: Contribution[],
  settings: ProvisioningSettings,
  today: Date,
): ReserveSummary {
  const summary: ReserveSummary = { saved: 0, expected: 0, goal: 0 }
  for (const item of items.filter((i) => i.status === 'active')) {
    const goal = targetCost(item, purchases, settings, today)
    if (goal == null) continue
    summary.goal += goal
    summary.saved += Math.min(goal, savedForItem(item, purchases, contributions))
    summary.expected += expectedSavedByNow(item, purchases, settings, today)
  }
  return summary
}

export interface DepositShare {
  itemId: string
  amount: number
}

/**
 * Splits a single monthly deposit across active items in proportion to each
 * item's monthly provision. An item never receives more than it still lacks
 * for its next replacement; what it can't absorb is redistributed among the
 * rest, and anything left after every item is fully funded goes to the item
 * with the largest provision. Amounts are rounded to cents and sum exactly
 * to `amount`.
 */
export function distributeDeposit(
  items: Item[],
  purchases: Purchase[],
  contributions: Contribution[],
  settings: ProvisioningSettings,
  today: Date,
  amount: number,
): DepositShare[] {
  const candidates = items
    .filter((i) => i.status === 'active')
    .map((item) => {
      const goal = targetCost(item, purchases, settings, today) ?? 0
      return {
        itemId: item.id,
        weight: monthlyProvision(item, purchases, settings, today) ?? 0,
        room: Math.max(0, goal - savedForItem(item, purchases, contributions)),
        amount: 0,
      }
    })
    .filter((c) => c.weight > 0)
  if (candidates.length === 0 || amount <= 0) return []

  let remaining = amount
  let open = candidates.filter((c) => c.room > 0)
  while (remaining > 0.005 && open.length > 0) {
    const totalWeight = open.reduce((s, c) => s + c.weight, 0)
    let given = 0
    for (const c of open) {
      const share = Math.min(c.room, (remaining * c.weight) / totalWeight)
      c.amount += share
      c.room -= share
      given += share
    }
    remaining -= given
    open = open.filter((c) => c.room > 0.005)
  }

  const heaviest = candidates.reduce((a, b) => (b.weight > a.weight ? b : a))
  heaviest.amount += Math.max(0, remaining)

  const shares = candidates.map((c) => ({ itemId: c.itemId, amount: Math.round(c.amount * 100) / 100 }))
  const drift = Math.round((amount - shares.reduce((s, c) => s + c.amount, 0)) * 100) / 100
  const heaviestShare = shares.find((c) => c.itemId === heaviest.itemId)!
  heaviestShare.amount = Math.round((heaviestShare.amount + drift) * 100) / 100
  return shares.filter((c) => c.amount > 0)
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

export interface CategoryProvision {
  categoryId: string
  total: number
}

/** Monthly provision total for each active item, grouped by category. */
export function provisionByCategory(
  items: Item[],
  purchases: Purchase[],
  settings: ProvisioningSettings,
  today: Date,
): CategoryProvision[] {
  const totals = new Map<string, number>()
  for (const item of items.filter((i) => i.status === 'active')) {
    const provision = monthlyProvision(item, purchases, settings, today)
    if (provision == null) continue
    totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + provision)
  }
  return [...totals.entries()]
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total)
}

export interface MonthSpend {
  /** "YYYY-MM" */
  month: string
  total: number
}

/** Actual amount spent on registered purchases per month, most recent `monthsBack` months (oldest first). */
export function historicalSpendByMonth(purchases: Purchase[], today: Date, monthsBack = 6): MonthSpend[] {
  const buckets: MonthSpend[] = Array.from({ length: monthsBack }, (_, i) => {
    const d = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), i - (monthsBack - 1))
    return { month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, total: 0 }
  })

  for (const purchase of purchases) {
    const d = parseISODate(purchase.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const bucket = buckets.find((b) => b.month === key)
    if (bucket) bucket.total += purchase.unitPrice * purchase.quantity
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
