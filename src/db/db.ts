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

/**
 * The original schema conflated "category" with what is really an item
 * type (fones de ouvido, travesseiro...). This splits them: categories
 * become broad groupings, and the old per-item-type list moves to
 * ITEM_TYPES as a naming/lifespan suggestion catalog. Existing categories
 * and item categoryIds are remapped so installed apps don't lose data.
 */
const OLD_CATEGORY_TO_NEW: Record<string, { categoryId: string; icon: string }> = {
  fones: { categoryId: 'eletronicos', icon: 'SpeakerWaveIcon' },
  travesseiro: { categoryId: 'cama-mesa-banho', icon: 'MoonIcon' },
  'roupa-de-cama': { categoryId: 'cama-mesa-banho', icon: 'Square3Stack3DIcon' },
  meias: { categoryId: 'roupas', icon: 'SwatchIcon' },
  tenis: { categoryId: 'roupas', icon: 'BoltIcon' },
  oculos: { categoryId: 'outros', icon: 'EyeIcon' },
  'escova-de-dentes': { categoryId: 'outros', icon: 'SparklesIcon' },
  toalhas: { categoryId: 'cama-mesa-banho', icon: 'Square2StackIcon' },
}

db.version(3)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('items').toCollection().modify((item) => {
      const remap = OLD_CATEGORY_TO_NEW[item.categoryId]
      if (remap) {
        item.categoryId = remap.categoryId
        item.icon = remap.icon
      }
    })
    await tx.table('categories').clear()
    await tx.table('categories').bulkAdd(DEFAULT_CATEGORIES)
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
  { id: 'roupas', name: 'Roupas', icon: 'SwatchIcon', defaultLifespanMonths: 12 },
  { id: 'cama-mesa-banho', name: 'Cama, mesa e banho', icon: 'HomeModernIcon', defaultLifespanMonths: 24 },
  { id: 'cozinha', name: 'Cozinha', icon: 'CakeIcon', defaultLifespanMonths: 24 },
  { id: 'eletronicos', name: 'Eletrônicos', icon: 'CpuChipIcon', defaultLifespanMonths: 24 },
  { id: 'pets', name: 'Pets', icon: 'HeartIcon', defaultLifespanMonths: 12 },
  { id: 'outros', name: 'Outros', icon: 'EllipsisHorizontalCircleIcon', defaultLifespanMonths: 12 },
]

/** Suggestion catalog for the "Item" autocomplete in the item form. */
export interface ItemType {
  name: string
  icon: string
  defaultLifespanMonths: number
}

export const ITEM_TYPES: ItemType[] = [
  { name: 'Fone de ouvido', icon: 'SpeakerWaveIcon', defaultLifespanMonths: 24 },
  { name: 'Travesseiro', icon: 'MoonIcon', defaultLifespanMonths: 18 },
  { name: 'Roupa de cama', icon: 'Square3Stack3DIcon', defaultLifespanMonths: 36 },
  { name: 'Meias', icon: 'SwatchIcon', defaultLifespanMonths: 12 },
  { name: 'Tênis', icon: 'BoltIcon', defaultLifespanMonths: 12 },
  { name: 'Óculos', icon: 'EyeIcon', defaultLifespanMonths: 24 },
  { name: 'Escova de dentes', icon: 'SparklesIcon', defaultLifespanMonths: 3 },
  { name: 'Toalhas', icon: 'Square2StackIcon', defaultLifespanMonths: 24 },
]

export async function seedIfEmpty(): Promise<void> {
  const settingsCount = await db.settings.count()
  if (settingsCount === 0) await db.settings.put(DEFAULT_SETTINGS)

  const categoryCount = await db.categories.count()
  if (categoryCount === 0) await db.categories.bulkPut(DEFAULT_CATEGORIES)
}
