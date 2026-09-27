import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCategories, useItems } from '../hooks/useAppData'
import { db, ITEM_TYPES, type ItemType } from '../db/db'
import { todayISO } from '../domain/format'
import { filterItemTypes, matchItemType } from '../domain/itemTypeMatch'
import { CategoryIcon } from '../components/IconBadge'
import { Button } from '../components/Button'

export function ItemForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const categories = useCategories()
  const items = useItems()
  const editing = id ? items?.find((i) => i.id === id) : undefined

  const [categoryId, setCategoryId] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [icon, setIcon] = useState<string | undefined>(undefined)
  const [name, setName] = useState('')
  const [lifespanMonths, setLifespanMonths] = useState(12)
  const [quantity, setQuantity] = useState(1)
  const [estimatedLastPurchaseDate, setEstimatedLastPurchaseDate] = useState(todayISO())
  const [estimatedLastPrice, setEstimatedLastPrice] = useState('')
  const [manualTargetPrice, setManualTargetPrice] = useState('')
  /** Catalog entry last applied to icon/lifespan/category, so typing more words doesn't re-apply it over manual edits. */
  const appliedType = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (editing) {
      setCategoryId(editing.categoryId)
      setIcon(editing.icon)
      setName(editing.name)
      setLifespanMonths(editing.lifespanMonths)
      setQuantity(editing.quantity)
      setEstimatedLastPurchaseDate(editing.estimatedLastPurchaseDate ?? todayISO())
      setEstimatedLastPrice(editing.estimatedLastPrice?.toString() ?? '')
      setManualTargetPrice(editing.manualTargetPrice?.toString() ?? '')
      appliedType.current = matchItemType(editing.name, ITEM_TYPES)?.name
    } else if (categories && categories.length > 0 && !categoryId) {
      setCategoryId(categories.find((c) => !c.hidden)?.id ?? categories[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, categories])

  const suggestions = useMemo(() => filterItemTypes(name, ITEM_TYPES), [name])
  const matched = useMemo(() => matchItemType(name, ITEM_TYPES), [name])
  const selectableCategories = (categories ?? []).filter((c) => !c.hidden || c.id === categoryId)

  function applyType(type: ItemType) {
    appliedType.current = type.name
    setIcon(type.icon)
    setLifespanMonths(type.defaultLifespanMonths)
    if (categories?.some((c) => c.id === type.categoryId)) setCategoryId(type.categoryId)
  }

  function onNameChange(value: string) {
    setName(value)
    setShowSuggestions(true)
    const type = matchItemType(value, ITEM_TYPES)
    if (type && type.name !== appliedType.current) applyType(type)
  }

  function pickSuggestion(type: ItemType) {
    setShowSuggestions(false)
    applyType(type)
    const sameTypeCount = (items ?? []).filter(
      (i) => i.id !== editing?.id && matchItemType(i.name, ITEM_TYPES)?.name === type.name,
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
      status: editing?.status ?? ('active' as const),
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

  // Hide the list once the name already contains a full suggestion — it has done its job.
  const suggestionsVisible = showSuggestions && suggestions.length > 0 && !matched

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 px-4 pt-6">
      <h1 className="text-xl font-bold text-ink">
        {editing ? 'Editar item' : 'Novo item'}
      </h1>

      <div className="relative">
        <label className="block text-sm font-medium text-sub">
          Nome do item
          <div className="relative mt-1">
            {icon && (
              <CategoryIcon
                name={icon}
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent"
              />
            )}
            <input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="Ex.: Fone de ouvido Bluetooth"
              autoComplete="off"
              required
              className={`w-full rounded-lg border border-line-strong bg-surface py-2 pr-3 text-base font-normal text-ink ${icon ? 'pl-9' : 'pl-3'}`}
            />
          </div>
        </label>
        {matched && (
          <p className="mt-1 text-xs text-sub">
            Reconhecido como <span className="font-medium text-accent">{matched.name}</span>:
            ícone, vida útil e categoria preenchidos.
          </p>
        )}
        {suggestionsVisible && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
            {suggestions.map((type) => (
              <li key={type.name}>
                <button
                  type="button"
                  onMouseDown={() => pickSuggestion(type)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sub hover:bg-accent-soft"
                >
                  <CategoryIcon name={type.icon} className="h-4 w-4 text-accent" />
                  {type.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-sub">
        Categoria
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
        >
          {selectableCategories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-sub">
          Vida útil (meses)
          <input
            type="number"
            min={1}
            value={lifespanMonths}
            onChange={(e) => setLifespanMonths(Number(e.target.value))}
            className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-sub">
          Quantidade
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
          />
        </label>
      </div>

      {!editing && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-sub">
            Última compra em
            <input
              type="date"
              value={estimatedLastPurchaseDate}
              onChange={(e) => setEstimatedLastPurchaseDate(e.target.value)}
              className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sub">
            Preço pago (R$)
            <input
              type="number"
              min={0}
              step="0.01"
              value={estimatedLastPrice}
              onChange={(e) => setEstimatedLastPrice(e.target.value)}
              placeholder="opcional"
              className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
            />
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium text-sub">
        Preço-alvo manual (R$) — opcional
        <input
          type="number"
          min={0}
          step="0.01"
          value={manualTargetPrice}
          onChange={(e) => setManualTargetPrice(e.target.value)}
          placeholder="deixe em branco para o app estimar"
          className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
        />
      </label>

      <Button type="submit" className="mt-2 py-3 text-center">
        {editing ? 'Salvar alterações' : 'Adicionar item'}
      </Button>
    </form>
  )
}
