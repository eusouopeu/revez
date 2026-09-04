import type { AppSettings, Item, Purchase } from './types'
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

/**
 * Monthly amount to set aside for one item under the "provision per item"
 * method: remaining cost divided by remaining months. An item due within a
 * month (or overdue) provisions its full remaining cost that month.
 *
 * See docs/PROVISIONING-METHODS.md for the alternative (perpetual average).
 */
export function monthlyProvision(
  item: Item,
  purchases: Purchase[],
  settings: Pick<AppSettings, 'annualInflationRate'>,
  today: Date,
): number | undefined {
  const targetDate = nextReplacementDate(item, purchases)
  const price = projectedPrice(item, purchases, settings, today)
  if (!targetDate || price == null) return undefined

  const totalCost = price * item.quantity
  const monthsRemaining = Math.max(1, monthsBetween(today, targetDate))
  return totalCost / monthsRemaining
}

export function totalMonthly(
  items: Item[],
  purchases: Purchase[],
  settings: Pick<AppSettings, 'annualInflationRate'>,
  today: Date,
): number {
  return items
    .filter((i) => i.status === 'active')
    .reduce((sum, item) => sum + (monthlyProvision(item, purchases, settings, today) ?? 0), 0)
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
