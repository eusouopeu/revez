import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useCategories, useItems } from '../hooks/useAppData'
import { db, ITEM_TYPES, type ItemType } from '../db/db'
import { todayISO } from '../domain/format'
import { CategoryIcon } from '../components/IconBadge'

export function ItemForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const categories = useCategories()
  const items = useItems()
  const editing = id ? items?.find((i) => i.id === id) : undefined

  const [categoryId, setCategoryId] = useState('')
  const [itemTypeQuery, setItemTypeQuery] = useState('')
  const [showItemTypeSuggestions, setShowItemTypeSuggestions] = useState(false)
  const [icon, setIcon] = useState<string | undefined>(undefined)
  const [name, setName] = useState('')
  const [lifespanMonths, setLifespanMonths] = useState(12)
  const [quantity, setQuantity] = useState(1)
  const [estimatedLastPurchaseDate, setEstimatedLastPurchaseDate] = useState(todayISO())
  const [estimatedLastPrice, setEstimatedLastPrice] = useState('')
  const [manualTargetPrice, setManualTargetPrice] = useState('')

  useEffect(() => {
    if (editing) {
      setCategoryId(editing.categoryId)
      setItemTypeQuery('')
      setIcon(editing.icon)
      setName(editing.name)
      setLifespanMonths(editing.lifespanMonths)
      setQuantity(editing.quantity)
      setEstimatedLastPurchaseDate(editing.estimatedLastPurchaseDate ?? todayISO())
      setEstimatedLastPrice(editing.estimatedLastPrice?.toString() ?? '')
      setManualTargetPrice(editing.manualTargetPrice?.toString() ?? '')
    } else if (categories && categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, categories])

  const itemTypeSuggestions = useMemo(() => {
    const q = itemTypeQuery.trim().toLowerCase()
    if (!q) return ITEM_TYPES
    return ITEM_TYPES.filter((t) => t.name.toLowerCase().includes(q))
  }, [itemTypeQuery])

  function pickItemType(type: ItemType) {
    setItemTypeQuery(type.name)
    setShowItemTypeSuggestions(false)
    setIcon(type.icon)
    setLifespanMonths(type.defaultLifespanMonths)

    const sameTypeCount = (items ?? []).filter((i) =>
      i.name.toLowerCase().startsWith(type.name.toLowerCase()),
    ).length
    setName(sameTypeCount > 0 ? `${type.name} ${sameTypeCount + 1}` : type.name)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !categoryId) return

    const payload = {
      categoryId,
      name: name.trim(),
      icon,
      lifespanMonths,
      quantity,
      status: 'active' as const,
      estimatedLastPurchaseDate: estimatedLastPurchaseDate || undefined,
      estimatedLastPrice: estimatedLastPrice ? Number(estimatedLastPrice) : undefined,
      manualTargetPrice: manualTargetPrice ? Number(manualTargetPrice) : undefined,
    }

    if (editing) {
      await db.items.update(editing.id, payload)
      navigate(`/itens/${editing.id}`)
    } else {
      const newId = crypto.randomUUID()
      await db.items.add({ id: newId, createdAt: new Date().toISOString(), ...payload })
      navigate(`/itens/${newId}`)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 px-4 pt-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
        {editing ? 'Editar item' : 'Novo item'}
      </h1>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Categoria</label>
        <div className="grid grid-cols-3 gap-2">
          {categories?.map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setCategoryId(cat.id)}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] ${
                categoryId === cat.id
                  ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
                  : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400'
              }`}
            >
              <CategoryIcon name={cat.icon} className="h-5 w-5" />
              <span className="truncate">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Item
          <input
            value={itemTypeQuery}
            onChange={(e) => {
              setItemTypeQuery(e.target.value)
              setShowItemTypeSuggestions(true)
            }}
            onFocus={() => setShowItemTypeSuggestions(true)}
            onBlur={() => setTimeout(() => setShowItemTypeSuggestions(false), 150)}
            placeholder="Ex.: Fone de ouvido"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          />
        </label>
        {showItemTypeSuggestions && itemTypeSuggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {itemTypeSuggestions.map((type) => (
              <li key={type.name}>
                <button
                  type="button"
                  onMouseDown={() => pickItemType(type)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-violet-50 dark:text-slate-300 dark:hover:bg-violet-950"
                >
                  <CategoryIcon name={type.icon} className="h-4 w-4 text-violet-500" />
                  {type.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        Nome do item
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Fone Bluetooth"
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
          Vida útil (meses)
          <input
            type="number"
            min={1}
            value={lifespanMonths}
            onChange={(e) => setLifespanMonths(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
          Quantidade
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
          />
        </label>
      </div>

      {!editing && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Última compra em
            <input
              type="date"
              value={estimatedLastPurchaseDate}
              onChange={(e) => setEstimatedLastPurchaseDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Preço pago (R$)
            <input
              type="number"
              min={0}
              step="0.01"
              value={estimatedLastPrice}
              onChange={(e) => setEstimatedLastPrice(e.target.value)}
              placeholder="opcional"
              className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            />
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        Preço-alvo manual (R$) — opcional
        <input
          type="number"
          min={0}
          step="0.01"
          value={manualTargetPrice}
          onChange={(e) => setManualTargetPrice(e.target.value)}
          placeholder="deixe em branco para o app estimar"
          className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
      </label>

      <button
        type="submit"
        className="mt-2 rounded-lg bg-violet-600 py-3 text-center font-semibold text-white active:bg-violet-700"
      >
        {editing ? 'Salvar alterações' : 'Adicionar item'}
      </button>
    </form>
  )
}
