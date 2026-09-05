import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, Category, Contribution, Item, Purchase } from '../domain/types'

export const db = new Dexie('revez') as Dexie & {
  categories: EntityTable<Category, 'id'>
  items: EntityTable<Item, 'id'>
  purchases: EntityTable<Purchase, 'id'>
  contributions: EntityTable<Contribution, 'id'>
  settings: EntityTable<AppSettings, 'id'>
}

db.version(1).stores({
  categories: 'id, name',
  items: 'id, categoryId, status',
  purchases: 'id, itemId, date',
  settings: 'id',
})

db.version(2).stores({
  contributions: 'id, itemId, date',
})

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'settings',
  annualInflationRate: 0.045,
  currency: 'BRL',
  monthlyDigestDayOfMonth: 1,
  reminderLeadDays: 30,
  provisioningMethod: 'per-item',
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'fones', name: 'Fones de ouvido', icon: 'SpeakerWaveIcon', defaultLifespanMonths: 24 },
  { id: 'travesseiro', name: 'Travesseiro', icon: 'MoonIcon', defaultLifespanMonths: 18 },
  { id: 'roupa-de-cama', name: 'Roupa de cama', icon: 'Square3Stack3DIcon', defaultLifespanMonths: 36 },
  { id: 'meias', name: 'Meias', icon: 'SwatchIcon', defaultLifespanMonths: 12 },
  { id: 'tenis', name: 'Tênis', icon: 'BoltIcon', defaultLifespanMonths: 12 },
  { id: 'oculos', name: 'Óculos', icon: 'EyeIcon', defaultLifespanMonths: 24 },
  { id: 'escova-de-dentes', name: 'Escova de dentes', icon: 'SparklesIcon', defaultLifespanMonths: 3 },
  { id: 'toalhas', name: 'Toalhas', icon: 'Square2StackIcon', defaultLifespanMonths: 24 },
]

export async function seedIfEmpty(): Promise<void> {
  const settingsCount = await db.settings.count()
  if (settingsCount === 0) await db.settings.put(DEFAULT_SETTINGS)

  const categoryCount = await db.categories.count()
  if (categoryCount === 0) await db.categories.bulkPut(DEFAULT_CATEGORIES)
}
