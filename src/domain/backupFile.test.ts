import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, BackupError, daysSinceBackup, parseBackup, totalSkipped } from './backupFile'
import type { AppSettings } from './types'

const DEFAULTS: AppSettings = {
  id: 'settings',
  annualInflationRate: 0.045,
  currency: 'BRL',
  monthlyDigestDayOfMonth: 1,
  reminderLeadDays: 30,
  provisioningMethod: 'per-item',
}

const validFile = {
  version: 1,
  exportedAt: '2026-01-10T12:00:00.000Z',
  categories: [{ id: 'outros', name: 'Outros', icon: 'TagIcon', defaultLifespanMonths: 12 }],
  items: [
    {
      id: 'i1',
      categoryId: 'outros',
      name: 'Travesseiro',
      lifespanMonths: 18,
      quantity: 1,
      status: 'active',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  purchases: [{ id: 'p1', itemId: 'i1', date: '2026-01-05', unitPrice: 90, quantity: 1 }],
  contributions: [{ id: 'c1', itemId: 'i1', date: '2026-01-06', amount: 20 }],
  settings: { ...DEFAULTS, reminderLeadDays: 15 },
}

describe('parseBackup', () => {
  it('reads a valid file and upgrades it to the current format', () => {
    const { backup, summary } = parseBackup(JSON.stringify(validFile), DEFAULTS)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(backup.items).toHaveLength(1)
    expect(backup.settings.reminderLeadDays).toBe(15)
    expect(summary.version).toBe(1)
    expect(totalSkipped(summary)).toBe(0)
  })

  it('fills missing settings fields from the app defaults', () => {
    const file = { ...validFile, settings: { id: 'settings', reminderLeadDays: 7 } }
    const { backup } = parseBackup(JSON.stringify(file), DEFAULTS)
    expect(backup.settings.reminderLeadDays).toBe(7)
    expect(backup.settings.provisioningMethod).toBe('per-item')
  })

  it('drops malformed records instead of importing them', () => {
    const file = {
      ...validFile,
      items: [...validFile.items, { id: 'bad', name: 'sem categoria' }, null],
      purchases: [...validFile.purchases, { id: 'p2', itemId: 'i1', date: '05/01/2026', unitPrice: 10, quantity: 1 }],
      contributions: [...validFile.contributions, { id: 'c2', itemId: 'apagado', date: '2026-01-06', amount: 5 }],
    }
    const { backup, summary } = parseBackup(JSON.stringify(file), DEFAULTS)
    expect(backup.items).toHaveLength(1)
    expect(backup.purchases).toHaveLength(1)
    expect(backup.contributions).toHaveLength(1) // the orphan is dropped too
    expect(summary.skipped).toEqual({ categories: 0, items: 2, purchases: 1, contributions: 1 })
    expect(totalSkipped(summary)).toBe(4)
  })

  it('refuses a file from a newer app version', () => {
    const file = { ...validFile, version: BACKUP_VERSION + 1 }
    expect(() => parseBackup(JSON.stringify(file), DEFAULTS)).toThrow(BackupError)
  })

  it('refuses unreadable or unrelated files', () => {
    expect(() => parseBackup('não é json', DEFAULTS)).toThrow(BackupError)
    expect(() => parseBackup(JSON.stringify({ hello: 'world' }), DEFAULTS)).toThrow(BackupError)
    const emptyish = { ...validFile, items: [{ id: 'bad' }], categories: [] }
    expect(() => parseBackup(JSON.stringify(emptyish), DEFAULTS)).toThrow(BackupError)
  })
})

describe('daysSinceBackup', () => {
  const today = new Date(2026, 8, 13)

  it('counts whole days since the export', () => {
    expect(daysSinceBackup(new Date(2026, 8, 3).toISOString(), today)).toBe(10)
    expect(daysSinceBackup(today.toISOString(), today)).toBe(0)
  })

  it('is undefined when there is no valid timestamp', () => {
    expect(daysSinceBackup(undefined, today)).toBeUndefined()
    expect(daysSinceBackup('ontem', today)).toBeUndefined()
  })
})
