import { useEffect } from 'react'
import { useItems, usePurchases, useSettings } from './useAppData'
import { syncNotifications } from '../notifications/scheduler'
import { totalMonthly } from '../domain/calculations'

/** Reschedules local notifications whenever items, purchases, or settings change. */
export function useNotificationsSync() {
  const items = useItems()
  const purchases = usePurchases()
  const settings = useSettings()

  useEffect(() => {
    if (!items || !purchases || !settings) return
    const active = items.filter((i) => i.status === 'active')
    syncNotifications(items, purchases, settings, totalMonthly(active, purchases, settings, new Date()))
  }, [items, purchases, settings])
}
