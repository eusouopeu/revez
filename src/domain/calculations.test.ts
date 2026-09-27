import { describe, expect, it } from 'vitest'
import {
  activePostponementMonths,
  distributeDeposit,
  expectedSavedByNow,
  historicalSpendByMonth,
  incompleteItems,
  missingDataFor,
  monthlyProvision,
  nextReplacementDate,
  observedLifespanMonths,
  postponementFor,
  projectedPrice,
  projectionByMonth,
  provisionBreakdown,
  reserveSummary,
  savedForItem,
  settleCycle,
  targetCost,
  totalMonthly,
  urgencyOf,
} from './calculations'
import type { AppSettings, Contribution, Item, Purchase } from './types'

const TODAY = new Date(2026, 8, 13) // 13 Sep 2026

const settings: Pick<AppSettings, 'annualInflationRate' | 'provisioningMethod'> = {
  annualInflationRate: 0.1,
  provisioningMethod: 'per-item',
}

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
    categoryId: 'outros',
    name: overrides.id,
    lifespanMonths: 12,
    quantity: 1,
    status: 'active',
    createdAt: '2020-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function purchase(id: string, itemId: string, date: string, unitPrice: number, quantity = 1): Purchase {
  return { id, itemId, date, unitPrice, quantity }
}

function contribution(id: string, itemId: string, date: string, amount: number): Contribution {
  return { id, itemId, date, amount }
}

describe('nextReplacementDate', () => {
  it('counts the lifespan from the last purchase', () => {
    const it1 = item({ id: 'a', lifespanMonths: 6, estimatedLastPurchaseDate: '2025-01-10' })
    const purchases = [purchase('p1', 'a', '2026-01-10', 100), purchase('p2', 'a', '2026-03-10', 100)]
    expect(nextReplacementDate(it1, purchases)).toEqual(new Date(2026, 8, 10))
  })

  it('falls back to the estimated purchase date, and is undefined without either', () => {
    const anchored = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-02-28' })
    expect(nextReplacementDate(anchored, [])).toEqual(new Date(2027, 1, 28))
    expect(nextReplacementDate(item({ id: 'b' }), [])).toBeUndefined()
  })

  it('does not roll over when the anchor day is missing from the target month', () => {
    const jan31 = item({ id: 'a', lifespanMonths: 1, estimatedLastPurchaseDate: '2026-01-31' })
    expect(nextReplacementDate(jan31, [])).toEqual(new Date(2026, 1, 28))
  })
})

describe('postponement', () => {
  const overdue = item({ id: 'a', lifespanMonths: 3, estimatedLastPurchaseDate: '2026-05-01' })

  it('pushes an overdue item past today, not past the missed date', () => {
    const postponement = postponementFor(overdue, [], TODAY, 1)!
    const postponed = { ...overdue, postponement }
    const target = nextReplacementDate(postponed, [])!
    expect(target.getTime()).toBeGreaterThan(TODAY.getTime())
    expect(target).toEqual(new Date(2026, 10, 1))
  })

  it('adds to an item that is not due yet', () => {
    const future = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-06-01' })
    const postponement = postponementFor(future, [], TODAY, 3)!
    expect(nextReplacementDate({ ...future, postponement }, [])).toEqual(new Date(2027, 8, 1))
  })

  it('expires once a newer purchase moves the cycle anchor', () => {
    const postponed = { ...overdue, postponement: { cycleStart: '2026-05-01', months: 3 } }
    expect(activePostponementMonths(postponed, [])).toBe(3)
    const purchases = [purchase('p1', 'a', '2026-07-01', 20)]
    expect(activePostponementMonths(postponed, purchases)).toBe(0)
    expect(nextReplacementDate(postponed, purchases)).toEqual(new Date(2026, 9, 1))
  })
})

describe('projectedPrice', () => {
  it('compounds the last paid price by inflation until the replacement date', () => {
    const it1 = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2025-09-13', estimatedLastPrice: 100 })
    const purchases = [purchase('p1', 'a', '2025-09-13', 100)]
    expect(projectedPrice(it1, purchases, settings, TODAY)).toBeCloseTo(110, 1)
  })

  it('lets a manual target price win over any projection', () => {
    const it1 = item({ id: 'a', manualTargetPrice: 500, estimatedLastPurchaseDate: '2025-09-13', estimatedLastPrice: 100 })
    expect(projectedPrice(it1, [], settings, TODAY)).toBe(500)
  })

  it('never projects below the last price paid, even on a falling trend', () => {
    const it1 = item({ id: 'a', lifespanMonths: 12 })
    const purchases = [
      purchase('p1', 'a', '2022-09-13', 200),
      purchase('p2', 'a', '2023-09-13', 170),
      purchase('p3', 'a', '2024-09-13', 140),
      purchase('p4', 'a', '2025-09-13', 110),
    ]
    expect(projectedPrice(it1, purchases, settings, TODAY)).toBe(110)
  })
})

describe('monthlyProvision', () => {
  it('splits the remaining cost over the remaining months', () => {
    const it1 = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
    const provision = monthlyProvision(it1, [], { ...settings, annualInflationRate: 0 }, TODAY)!
    expect(provision).toBeCloseTo(20, 5) // 120 over the 6 months left
  })

  it('multiplies by quantity', () => {
    const it1 = item({ id: 'a', quantity: 3, lifespanMonths: 12, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
    expect(monthlyProvision(it1, [], { ...settings, annualInflationRate: 0 }, TODAY)).toBeCloseTo(60, 5)
  })

  it('divides by the full lifespan under perpetual-average', () => {
    const it1 = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
    const method = { annualInflationRate: 0, provisioningMethod: 'perpetual-average' as const }
    expect(monthlyProvision(it1, [], method, TODAY)).toBeCloseTo(10, 5)
  })

  it('provisions the whole cost in the current month when overdue', () => {
    const it1 = item({ id: 'a', lifespanMonths: 3, estimatedLastPurchaseDate: '2026-01-13', estimatedLastPrice: 90 })
    expect(monthlyProvision(it1, [], { ...settings, annualInflationRate: 0 }, TODAY)).toBeCloseTo(90, 5)
  })

  it('is undefined without a price, and such items count as zero in the total', () => {
    const noPrice = item({ id: 'a', estimatedLastPurchaseDate: '2026-03-13' })
    const priced = item({ id: 'b', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
    expect(monthlyProvision(noPrice, [], settings, TODAY)).toBeUndefined()
    expect(totalMonthly([noPrice, priced], [], { ...settings, annualInflationRate: 0 }, TODAY)).toBeCloseTo(20, 5)
  })

  it('leaves archived items out of the total', () => {
    const archived = item({ id: 'a', status: 'archived', estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
    expect(totalMonthly([archived], [], settings, TODAY)).toBe(0)
  })
})

describe('provisionBreakdown', () => {
  it('separates items due within a month from the recurring part', () => {
    const due = item({ id: 'a', lifespanMonths: 3, estimatedLastPurchaseDate: '2026-06-20', estimatedLastPrice: 60 })
    const later = item({ id: 'b', lifespanMonths: 24, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 240 })
    const { recurring, urgent } = provisionBreakdown([due, later], [], { ...settings, annualInflationRate: 0 }, TODAY)
    expect(urgent).toBeCloseTo(60, 5)
    expect(recurring).toBeGreaterThan(0)
  })

  it('never reports urgency under perpetual-average', () => {
    const due = item({ id: 'a', lifespanMonths: 3, estimatedLastPurchaseDate: '2026-06-20', estimatedLastPrice: 60 })
    const method = { annualInflationRate: 0, provisioningMethod: 'perpetual-average' as const }
    expect(provisionBreakdown([due], [], method, TODAY).urgent).toBe(0)
  })
})

describe('savedForItem', () => {
  const it1 = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2025-01-10' })
  const purchases = [purchase('p1', 'a', '2026-03-10', 100)]

  it('ignores contributions made before the current cycle started', () => {
    const contributions = [
      contribution('c1', 'a', '2026-01-10', 50), // previous cycle
      contribution('c2', 'a', '2026-03-10', 30), // same day the cycle starts
      contribution('c3', 'a', '2026-06-10', 20),
    ]
    expect(savedForItem(it1, purchases, contributions)).toBe(50)
  })

  it('ignores other items', () => {
    expect(savedForItem(it1, purchases, [contribution('c1', 'b', '2026-06-10', 90)])).toBe(0)
  })
})

describe('settleCycle', () => {
  it('reports the leftover when more was saved than spent', () => {
    expect(settleCycle(200, 150)).toEqual({ saved: 200, paid: 150, leftover: 50, shortfall: 0 })
  })

  it('reports the shortfall when the purchase cost more', () => {
    expect(settleCycle(100, 160)).toEqual({ saved: 100, paid: 160, leftover: 0, shortfall: 60 })
  })

  it('rounds to cents', () => {
    expect(settleCycle(0.1 + 0.2, 0.3)).toEqual({ saved: 0.3, paid: 0.3, leftover: 0, shortfall: 0 })
  })
})

describe('missingDataFor', () => {
  it('flags a missing purchase date and a missing price', () => {
    expect(missingDataFor(item({ id: 'a' }), [])).toBe('date')
    expect(missingDataFor(item({ id: 'a', estimatedLastPurchaseDate: '2026-01-10' }), [])).toBe('price')
  })

  it('accepts a manual target price as the price', () => {
    const it1 = item({ id: 'a', estimatedLastPurchaseDate: '2026-01-10', manualTargetPrice: 300 })
    expect(missingDataFor(it1, [])).toBeUndefined()
  })

  it('lists only active items that are incomplete', () => {
    const incomplete = item({ id: 'a' })
    const archived = item({ id: 'b', status: 'archived' })
    const complete = item({ id: 'c', estimatedLastPurchaseDate: '2026-01-10', estimatedLastPrice: 10 })
    expect(incompleteItems([incomplete, archived, complete], [])).toEqual([{ item: incomplete, missing: 'date' }])
  })
})

describe('distributeDeposit', () => {
  const a = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
  // 240 over the 18 months left = 13.33/month, against a's 120 over 6 = 20/month
  const b = item({ id: 'b', lifespanMonths: 24, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 240 })
  const noInflation = { annualInflationRate: 0, provisioningMethod: 'per-item' as const }

  it('splits in proportion to each provision and sums exactly to the deposit', () => {
    const shares = distributeDeposit([a, b], [], [], noInflation, TODAY, 100)
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(100)
    expect(shares.find((s) => s.itemId === 'a')!.amount).toBeCloseTo(60, 1)
    expect(shares.find((s) => s.itemId === 'b')!.amount).toBeCloseTo(40, 1)
  })

  it('splits evenly between items that need the same amount per month', () => {
    const twin = item({ id: 'c', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
    const shares = distributeDeposit([a, twin], [], [], noInflation, TODAY, 100)
    expect(shares.map((s) => s.amount)).toEqual([50, 50])
  })

  it('never gives an item more than it still lacks, and redistributes the rest', () => {
    const contributions = [contribution('c1', 'b', '2026-04-01', 239)] // inside b's current cycle
    const shares = distributeDeposit([a, b], [], contributions, noInflation, TODAY, 100)
    const toB = shares.find((s) => s.itemId === 'b')!
    expect(toB.amount).toBeCloseTo(1, 2)
    expect(shares.reduce((s, x) => s + x.amount, 0)).toBe(100)
  })

  it('returns nothing for a non-positive deposit or when there is nothing to fund', () => {
    expect(distributeDeposit([a], [], [], noInflation, TODAY, 0)).toEqual([])
    expect(distributeDeposit([item({ id: 'x' })], [], [], noInflation, TODAY, 50)).toEqual([])
  })
})

describe('reserve and projections', () => {
  it('expects the full goal once the replacement date has passed', () => {
    const overdue = item({ id: 'a', lifespanMonths: 3, estimatedLastPurchaseDate: '2026-01-13', estimatedLastPrice: 90 })
    const goal = targetCost(overdue, [], settings, TODAY)!
    expect(expectedSavedByNow(overdue, [], settings, TODAY)).toBeCloseTo(goal, 5)
  })

  it('expects about half the goal halfway through the cycle', () => {
    const half = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
    const noInflation = { annualInflationRate: 0, provisioningMethod: 'per-item' as const }
    expect(expectedSavedByNow(half, [], noInflation, TODAY)).toBeCloseTo(60, 5)
  })

  it('caps the saved total at each goal', () => {
    const it1 = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
    const noInflation = { annualInflationRate: 0, provisioningMethod: 'per-item' as const }
    const summary = reserveSummary([it1], [], [contribution('c1', 'a', '2026-04-01', 500)], noInflation, TODAY)
    expect(summary.goal).toBeCloseTo(120, 5)
    expect(summary.saved).toBeCloseTo(120, 5)
  })

  it('buckets each item into the month of its replacement date', () => {
    const it1 = item({ id: 'a', lifespanMonths: 12, estimatedLastPurchaseDate: '2026-03-13', estimatedLastPrice: 120 })
    const noInflation = { annualInflationRate: 0, provisioningMethod: 'per-item' as const }
    const months = projectionByMonth([it1], [], noInflation, TODAY, 12)
    expect(months[0].month).toBe('2026-09')
    expect(months.find((m) => m.month === '2027-03')!.total).toBeCloseTo(120, 5)
  })

  it('sums actual spend by month, price times quantity', () => {
    const spend = historicalSpendByMonth([purchase('p1', 'a', '2026-08-10', 50, 2)], TODAY, 6)
    expect(spend.at(-1)!.month).toBe('2026-09')
    expect(spend.find((m) => m.month === '2026-08')!.total).toBe(100)
  })
})

describe('urgencyOf and observedLifespanMonths', () => {
  it('classifies overdue, due soon, on track and unscheduled', () => {
    const overdue = item({ id: 'a', lifespanMonths: 1, estimatedLastPurchaseDate: '2026-01-13' })
    const soon = item({ id: 'b', lifespanMonths: 6, estimatedLastPurchaseDate: '2026-04-01' })
    const ok = item({ id: 'c', lifespanMonths: 24, estimatedLastPurchaseDate: '2026-01-13' })
    expect(urgencyOf(overdue, [], TODAY, 30)).toBe('overdue')
    expect(urgencyOf(soon, [], TODAY, 30)).toBe('due-soon')
    expect(urgencyOf(ok, [], TODAY, 30)).toBe('ok')
    expect(urgencyOf(item({ id: 'd' }), [], TODAY, 30)).toBe('unscheduled')
  })

  it('averages the interval between purchases, and needs at least two', () => {
    const it1 = item({ id: 'a' })
    expect(observedLifespanMonths(it1, [purchase('p1', 'a', '2026-01-10', 10)])).toBeUndefined()
    const purchases = [
      purchase('p1', 'a', '2024-01-10', 10),
      purchase('p2', 'a', '2025-01-10', 10),
      purchase('p3', 'a', '2026-01-10', 10),
    ]
    expect(observedLifespanMonths(it1, purchases)).toBeCloseTo(12, 5)
  })
})
