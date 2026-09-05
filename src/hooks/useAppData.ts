import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS } from '../db/db'

export function useItems() {
  return useLiveQuery(() => db.items.toArray(), [], [])
}

export function usePurchases() {
  return useLiveQuery(() => db.purchases.toArray(), [], [])
}

export function useCategories() {
  return useLiveQuery(() => db.categories.toArray(), [], [])
}

export function useSettings() {
  return useLiveQuery(
    async () => (await db.settings.get('settings')) ?? DEFAULT_SETTINGS,
    [],
    DEFAULT_SETTINGS,
  )
}

export function usePurchasesForItem(itemId: string) {
  return useLiveQuery(
    () => db.purchases.where('itemId').equals(itemId).sortBy('date'),
    [itemId],
    [],
  )
}

export function useContributions() {
  return useLiveQuery(() => db.contributions.toArray(), [], [])
}

export function useContributionsForItem(itemId: string) {
  return useLiveQuery(
    () => db.contributions.where('itemId').equals(itemId).sortBy('date'),
    [itemId],
    [],
  )
}
