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

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function monthsBetween(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return (to.getTime() - from.getTime()) / msPerDay / 30.44
}

export function yearsBetween(from: Date, to: Date): number {
  return monthsBetween(from, to) / 12
}
