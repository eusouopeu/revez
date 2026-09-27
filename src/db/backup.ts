import { db, DEFAULT_SETTINGS } from './db'
import { BACKUP_VERSION, type BackupFile, type ImportMode, parseBackup as parseBackupFile } from '../domain/backupFile'

export {
  BACKUP_VERSION,
  BackupError,
  daysSinceBackup,
  totalSkipped,
  type BackupFile,
  type BackupSummary,
  type ImportMode,
} from '../domain/backupFile'

/** Reads a backup file against this app's default settings. */
export function parseBackup(text: string) {
  return parseBackupFile(text, DEFAULT_SETTINGS)
}

export async function buildBackup(): Promise<BackupFile> {
  const [categories, items, purchases, contributions, settings] = await Promise.all([
    db.categories.toArray(),
    db.items.toArray(),
    db.purchases.toArray(),
    db.contributions.toArray(),
    db.settings.get('settings'),
  ])
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    categories,
    items,
    purchases,
    contributions,
    settings: settings ?? DEFAULT_SETTINGS,
  }
}

/**
 * `replace` wipes the database first; `merge` writes records over the
 * existing ones by id, keeping anything the file doesn't mention (so a
 * backup from another device adds to this one instead of erasing it).
 * Settings are only taken from the file on a replace.
 */
export async function applyBackup(backup: BackupFile, mode: ImportMode): Promise<void> {
  await db.transaction('rw', db.categories, db.items, db.purchases, db.contributions, db.settings, async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.categories.clear(),
        db.items.clear(),
        db.purchases.clear(),
        db.contributions.clear(),
        db.settings.clear(),
      ])
      await db.settings.put(backup.settings)
    }
    await db.categories.bulkPut(backup.categories)
    await db.items.bulkPut(backup.items)
    await db.purchases.bulkPut(backup.purchases)
    await db.contributions.bulkPut(backup.contributions)
  })
}
