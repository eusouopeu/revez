import type { Contribution, Item, Purchase } from '../domain/types'

/**
 * Sample dataset with estimated prices, built relative to `today` so the
 * urgency states (atrasado, em breve, em dia, sem data), the price trend
 * (4+ purchases), contributions, archived items and the 12-month projection
 * all have something to show. Every id starts with "demo-" so the set can be
 * removed without touching the user's own records.
 */
export function buildDemoData(today: Date) {
  const iso = (monthsAgo: number, day = 10) => {
    const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, day)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const createdAt = new Date(today.getFullYear() - 3, today.getMonth(), 1).toISOString()

  const item = (i: Omit<Item, 'createdAt' | 'status' | 'quantity'> & Partial<Item>): Item => ({
    status: 'active',
    quantity: 1,
    createdAt,
    ...i,
  })

  const items: Item[] = [
    // 5 purchases → price trend projection; due in ~2 months
    item({ id: 'demo-tenis', categoryId: 'roupas', name: 'Tênis de corrida', icon: 'BoltIcon', lifespanMonths: 12 }),
    // overdue
    item({ id: 'demo-escova', categoryId: 'outros', name: 'Escova de dentes', icon: 'SparklesIcon', lifespanMonths: 3, quantity: 2 }),
    // due soon (within reminder window)
    item({ id: 'demo-meias', categoryId: 'roupas', name: 'Meias (kit)', icon: 'SwatchIcon', lifespanMonths: 12, quantity: 3 }),
    item({ id: 'demo-fone', categoryId: 'eletronicos', name: 'Fone Bluetooth', icon: 'SpeakerWaveIcon', lifespanMonths: 24 }),
    item({ id: 'demo-travesseiro', categoryId: 'cama-mesa-banho', name: 'Travesseiro', icon: 'MoonIcon', lifespanMonths: 18, quantity: 2 }),
    item({ id: 'demo-lencol', categoryId: 'cama-mesa-banho', name: 'Jogo de lençol', icon: 'Square3Stack3DIcon', lifespanMonths: 36 }),
    item({ id: 'demo-toalhas', categoryId: 'cama-mesa-banho', name: 'Toalhas de banho', icon: 'Square2StackIcon', lifespanMonths: 24, quantity: 4 }),
    // manual target price
    item({ id: 'demo-oculos', categoryId: 'outros', name: 'Óculos de grau', icon: 'EyeIcon', lifespanMonths: 24, manualTargetPrice: 900 }),
    // no purchases yet: anchored by estimated date/price
    item({
      id: 'demo-panela',
      categoryId: 'cozinha',
      name: 'Frigideira antiaderente',
      lifespanMonths: 24,
      estimatedLastPurchaseDate: iso(20),
      estimatedLastPrice: 150,
    }),
    item({
      id: 'demo-racao-comedouro',
      categoryId: 'pets',
      name: 'Cama do cachorro',
      lifespanMonths: 12,
      estimatedLastPurchaseDate: iso(7),
      estimatedLastPrice: 180,
    }),
    // no date at all → "Sem data"
    item({ id: 'demo-carregador', categoryId: 'eletronicos', name: 'Carregador de celular', lifespanMonths: 24, estimatedLastPrice: 120 }),
    // archived
    item({ id: 'demo-mouse', categoryId: 'eletronicos', name: 'Mouse antigo', lifespanMonths: 36, status: 'archived' }),
  ]

  const purchaseRows: [string, number, number, number?][] = [
    // [itemId, monthsAgo, unitPrice, quantity]
    ['demo-tenis', 50, 299.9],
    ['demo-tenis', 38, 329.9],
    ['demo-tenis', 26, 349.9],
    ['demo-tenis', 14, 379.9],
    ['demo-tenis', 10, 399.9],
    ['demo-escova', 8, 14.9, 2],
    ['demo-escova', 4, 15.9, 2],
    ['demo-meias', 23, 49.9, 3],
    ['demo-meias', 11, 54.9, 3],
    ['demo-fone', 16, 249.0],
    ['demo-travesseiro', 5, 89.9, 2],
    ['demo-lencol', 30, 189.9],
    ['demo-toalhas', 3, 59.9, 4],
    ['demo-oculos', 21, 780.0],
    ['demo-mouse', 40, 99.9],
  ]
  const purchases: Purchase[] = purchaseRows.map(([itemId, monthsAgo, unitPrice, quantity = 1], idx) => ({
    id: `demo-purchase-${idx}`,
    itemId,
    date: iso(monthsAgo, 5 + (idx % 20)),
    unitPrice,
    quantity,
  }))

  const contributionRows: [string, number, number][] = [
    ['demo-tenis', 6, 80],
    ['demo-tenis', 3, 80],
    ['demo-tenis', 1, 80],
    ['demo-fone', 4, 40],
    ['demo-fone', 2, 40],
    ['demo-oculos', 5, 150],
    ['demo-oculos', 2, 150],
    ['demo-lencol', 1, 60],
  ]
  const contributions: Contribution[] = contributionRows.map(([itemId, monthsAgo, amount], idx) => ({
    id: `demo-contribution-${idx}`,
    itemId,
    date: iso(monthsAgo, 1),
    amount,
  }))

  return { items, purchases, contributions }
}
