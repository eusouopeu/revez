import { describe, expect, it } from 'vitest'
import { addMonths, monthsBetween, parseISODate, yearsBetween } from './dates'

describe('parseISODate', () => {
  it('reads the date as local midnight, not UTC', () => {
    const d = parseISODate('2026-01-10')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 0, 10])
    expect(d.getHours()).toBe(0)
  })
})

describe('addMonths', () => {
  it('clamps to the last day of the target month instead of rolling over', () => {
    expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28))
    expect(addMonths(new Date(2024, 0, 31), 1)).toEqual(new Date(2024, 1, 29)) // leap year
  })

  it('crosses years in both directions', () => {
    expect(addMonths(new Date(2026, 10, 15), 3)).toEqual(new Date(2027, 1, 15))
    expect(addMonths(new Date(2026, 1, 15), -3)).toEqual(new Date(2025, 10, 15))
  })
})

describe('monthsBetween', () => {
  it('is the exact inverse of addMonths for whole months', () => {
    const from = new Date(2026, 2, 13)
    for (const n of [1, 6, 12, 36]) {
      expect(monthsBetween(from, addMonths(from, n))).toBeCloseTo(n, 10)
    }
  })

  it('reports a fraction within the month and a negative count backwards', () => {
    expect(monthsBetween(new Date(2026, 0, 1), new Date(2026, 0, 16))).toBeCloseTo(15 / 31, 5)
    expect(monthsBetween(new Date(2026, 5, 10), new Date(2026, 2, 10))).toBeCloseTo(-3, 10)
  })

  it('converts to years', () => {
    expect(yearsBetween(new Date(2025, 0, 1), new Date(2027, 0, 1))).toBeCloseTo(2, 10)
  })
})
