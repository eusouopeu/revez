import { describe, expect, it } from 'vitest'
import { formatDate, formatMonthLabel } from './format'

describe('formatDate', () => {
  it('formats ISO dates as DD/MM/AAAA', () => {
    expect(formatDate('2026-03-05')).toBe('05/03/2026')
  })

  it('formats Date objects as DD/MM/AAAA', () => {
    expect(formatDate(new Date(2027, 11, 31))).toBe('31/12/2027')
  })
})

describe('formatMonthLabel', () => {
  it('formats a year-month as MM/AAAA', () => {
    expect(formatMonthLabel('2026-03')).toBe('03/2026')
  })
})
