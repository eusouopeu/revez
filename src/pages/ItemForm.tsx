import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCategories, useItems } from '../hooks/useAppData'
import { db, ITEM_TYPES, type ItemType } from '../db/db'
import { todayISO } from '../domain/format'
import { filterItemTypes, matchItemType } from '../domain/itemTypeMatch'
import { CategoryIcon } from '../components/IconBadge'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { Card, Field, inputClass } from '../components/ui'
import { CheckCircleIcon, ChevronDownIcon } from '@heroicons/react/24/outline'

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
  const [showAdvanced, setShowAdvanced] = useState(false)
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
      setShowAdvanced(editing.manualTargetPrice != null)
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
    <Screen title={editing ? 'Editar item' : 'Novo item'} back={!!editing}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <div className="relative">
            <Field label="Nome">
              <div className="relative">
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
                  placeholder="Ex.: Fone de ouvido"
                  autoComplete="off"
                  required
                  className={`${inputClass} ${icon ? 'pl-9' : ''}`}
                />
              </div>
            </Field>
            {matched && (
              <p
                className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-ok"
                title="Ícone, vida útil e categoria preenchidos"
              >
                <CheckCircleIcon className="h-4 w-4" /> {matched.name}
              </p>
            )}
            {suggestionsVisible && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
                {suggestions.map((type) => (
                  <li key={type.name}>
                    <button
                      type="button"
                      onMouseDown={() => pickSuggestion(type)}
                      className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[14px] text-ink hover:bg-accent-soft"
                    >
                      <CategoryIcon name={type.icon} className="h-4 w-4 text-accent" />
                      {type.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Field label="Categoria">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required className={inputClass}>
              {selectableCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Vida útil (meses)">
              <input
                type="number"
                min={1}
                value={lifespanMonths}
                onChange={(e) => setLifespanMonths(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
            <Field label="Quantidade">
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className={inputClass}
              />
            </Field>
          </div>

          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Última compra">
                <input
                  type="date"
                  value={estimatedLastPurchaseDate}
                  onChange={(e) => setEstimatedLastPurchaseDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Preço pago (R$)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={estimatedLastPrice}
                  onChange={(e) => setEstimatedLastPrice(e.target.value)}
                  placeholder="opcional"
                  className={inputClass}
                />
              </Field>
            </div>
          )}
        </Card>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex min-h-10 items-center gap-1 text-[13px] font-medium text-sub"
          >
            Mais opções
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {showAdvanced && (
            <Card className="mt-1">
              <Field label="Preço-alvo manual (R$)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={manualTargetPrice}
                  onChange={(e) => setManualTargetPrice(e.target.value)}
                  placeholder="em branco = estimado pelo app"
                  className={inputClass}
                />
              </Field>
            </Card>
          )}
        </div>

        <Button type="submit" className="min-h-12 w-full">
          {editing ? 'Salvar alterações' : 'Adicionar item'}
        </Button>
      </form>
    </Screen>
  )
}
