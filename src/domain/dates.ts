/**
 * Parses an ISO date-only string ("2024-01-10") as local midnight, not UTC
 * midnight — `new Date(iso)` parses date-only strings as UTC, which shifts
 * a day back once formatted in a negative-UTC-offset timezone (most of
 * Brazil). Every ISO date string in this app must go through this parser.
 */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Adds calendar months, clamping to the last day of the target month when
 * the origin day doesn't exist there (Jan 31 + 1 month = Feb 28, not Mar 3
 * — `Date#setMonth` would silently roll over into the next month).
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  const originalDay = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(originalDay, daysInTargetMonth))
  return d
}

/**
 * Calendar months between two dates, as a whole-month count plus a
 * fractional day component. Deliberately mirrors `addMonths` (calendar
 * arithmetic, not a fixed day-length division) so that
 * `monthsBetween(from, addMonths(from, n)) === n` — the denominator used
 * to spread a cost over time agrees with the date the app shows for it.
 */
export function monthsBetween(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  const daysInFromMonth = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate()
  const dayFraction = (to.getDate() - from.getDate()) / daysInFromMonth
  return months + dayFraction
}

export function yearsBetween(from: Date, to: Date): number {
  return monthsBetween(from, to) / 12
}
