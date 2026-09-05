export interface Category {
  id: string
  name: string
  icon: string // heroicon name, e.g. "SpeakerWaveIcon"
  defaultLifespanMonths: number
}

export interface Item {
  id: string
  categoryId: string
  name: string
  lifespanMonths: number
  quantity: number
  status: 'active' | 'archived'
  /** Only set before the first purchase is registered; anchors the first cycle. */
  estimatedLastPurchaseDate?: string // ISO date
  estimatedLastPrice?: number
  /** Overrides all price projection when set. */
  manualTargetPrice?: number
  createdAt: string
}

export interface Purchase {
  id: string
  itemId: string
  date: string // ISO date
  unitPrice: number
  quantity: number
  note?: string
}

/** A deposit set aside toward an item's next replacement, before it's bought. */
export interface Contribution {
  id: string
  itemId: string
  date: string // ISO date
  amount: number
}

export interface AppSettings {
  id: 'settings'
  annualInflationRate: number // e.g. 0.045
  currency: 'BRL'
  monthlyDigestDayOfMonth: number // 1-28
  reminderLeadDays: number
  provisioningMethod: 'per-item' | 'perpetual-average'
}
