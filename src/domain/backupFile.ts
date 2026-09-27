import type { AppSettings, Category, Contribution, Item, Purchase } from './types'

/**
 * Bump whenever the shape written by `buildBackup` changes, and add the
 * matching step to `migrate` so older files keep importing.
 *
 * - 1: categories, items, purchases, contributions, settings.
 * - 2: items may carry `postponement`; settings may carry `lastBackupAt`.
 */
export const BACKUP_VERSION = 2

export interface BackupFile {
  version: number
  exportedAt: string
  categories: Category[]
  items: Item[]
  purchases: Purchase[]
  contributions: Contribution[]
  settings: AppSettings
}

export interface BackupSummary {
  version: number
  exportedAt?: string
  categories: number
  items: number
  purchases: number
  contributions: number
  /** Records dropped for being malformed, by collection. */
  skipped: Record<string, number>
}

export type ImportMode = 'replace' | 'merge'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function validCategory(row: unknown): row is Category {
  return isObject(row) && isId(row.id) && typeof row.name === 'string' && typeof row.icon === 'string'
}

function validItem(row: unknown): row is Item {
  return (
    isObject(row) &&
    isId(row.id) &&
    isId(row.categoryId) &&
    typeof row.name === 'string' &&
    isPositiveNumber(row.lifespanMonths) &&
    isPositiveNumber(row.quantity) &&
    (row.status === 'active' || row.status === 'archived')
  )
}

function validPurchase(row: unknown): row is Purchase {
  return (
    isObject(row) &&
    isId(row.id) &&
    isId(row.itemId) &&
    isISODate(row.date) &&
    isPositiveNumber(row.unitPrice) &&
    isPositiveNumber(row.quantity)
  )
}

function validContribution(row: unknown): row is Contribution {
  return isObject(row) && isId(row.id) && isId(row.itemId) && isISODate(row.date) && isPositiveNumber(row.amount)
}

function keepValid<T>(rows: unknown, isValid: (row: unknown) => row is T): { rows: T[]; skipped: number } {
  if (!Array.isArray(rows)) return { rows: [], skipped: 0 }
  const kept = rows.filter(isValid)
  return { rows: kept, skipped: rows.length - kept.length }
}

/**
 * Brings an older file up to the current shape. Version 1 files simply
 * lack fields that are optional today, so there is nothing to rewrite yet
 * — the step exists so the next breaking change has somewhere to go.
 */
function migrate(backup: BackupFile): BackupFile {
  return { ...backup, version: BACKUP_VERSION }
}

export class BackupError extends Error {}

/**
 * Parses and validates a backup file, dropping malformed records instead
 * of letting them reach the database. Throws `BackupError` when the file
 * isn't a Revez backup at all, or was written by a newer app version.
 */
export function parseBackup(
  text: string,
  defaultSettings: AppSettings,
): { backup: BackupFile; summary: BackupSummary } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupError('Arquivo inválido: não é um JSON legível.')
  }
  if (!isObject(parsed) || !Array.isArray(parsed.items) || !Array.isArray(parsed.categories)) {
    throw new BackupError('Arquivo inválido: não parece um backup do Revez.')
  }

  const version = typeof parsed.version === 'number' ? parsed.version : 1
  if (version > BACKUP_VERSION) {
    throw new BackupError(
      `Backup criado por uma versão mais nova do app (formato ${version}). Atualize o Revez antes de importar.`,
    )
  }

  const categories = keepValid(parsed.categories, validCategory)
  const items = keepValid(parsed.items, validItem)
  const purchases = keepValid(parsed.purchases, validPurchase)
  const contributions = keepValid(parsed.contributions, validContribution)
  if (items.rows.length === 0 && categories.rows.length === 0) {
    throw new BackupError('Arquivo inválido: nenhum item ou categoria pôde ser lido.')
  }

  // Orphans would be invisible in the app and skew nothing but the totals.
  const itemIds = new Set(items.rows.map((i) => i.id))
  const keptPurchases = purchases.rows.filter((p) => itemIds.has(p.itemId))
  const keptContributions = contributions.rows.filter((c) => itemIds.has(c.itemId))

  const backup = migrate({
    version,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    categories: categories.rows,
    items: items.rows,
    purchases: keptPurchases,
    contributions: keptContributions,
    settings: isObject(parsed.settings)
      ? ({ ...defaultSettings, ...parsed.settings, id: 'settings' } as AppSettings)
      : defaultSettings,
  })

  return {
    backup,
    summary: {
      version,
      exportedAt: backup.exportedAt,
      categories: backup.categories.length,
      items: backup.items.length,
      purchases: backup.purchases.length,
      contributions: backup.contributions.length,
      skipped: {
        categories: categories.skipped,
        items: items.skipped,
        purchases: purchases.skipped + (purchases.rows.length - keptPurchases.length),
        contributions: contributions.skipped + (contributions.rows.length - keptContributions.length),
      },
    },
  }
}

export function totalSkipped(summary: BackupSummary): number {
  return Object.values(summary.skipped).reduce((sum, n) => sum + n, 0)
}

/** Days since the last export, or undefined when none was ever made. */
export function daysSinceBackup(lastBackupAt: string | undefined, today: Date): number | undefined {
  if (!lastBackupAt) return undefined
  const then = new Date(lastBackupAt).getTime()
  if (!Number.isFinite(then)) return undefined
  return Math.max(0, Math.floor((today.getTime() - then) / 86_400_000))
}
