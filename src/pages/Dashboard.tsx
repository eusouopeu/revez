import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../db/db'
import { useCategories, useContributions, useItems, usePurchases, useSettings } from '../hooks/useAppData'
import {
  distributeDeposit,
  incompleteItems,
  monthlyProvision,
  nextReplacementDate,
  provisionBreakdown,
  reserveSummary,
  savedForItem,
  targetCost,
  urgencyOf,
  type ItemUrgency,
} from '../domain/calculations'
import { formatBRL, formatDate, todayISO } from '../domain/format'
import { CategoryIcon } from '../components/IconBadge'
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { Card, Empty, IconButton, inputClass } from '../components/ui'
import { useToday } from '../hooks/useToday'
import type { Contribution, Item, Purchase } from '../domain/types'
import {
  ArchiveBoxArrowDownIcon,
  ArchiveBoxIcon,
  BanknotesIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ShoppingCartIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

/** Everything removed with an item, kept around so the delete can be undone. */
interface DeletedItemSnapshot {
  item: Item
  purchases: Purchase[]
  contributions: Contribution[]
}

const urgencyBg: Record<ItemUrgency, string> = {
  overdue: 'bg-erro-soft',
  'due-soon': 'bg-alerta-soft',
  ok: 'bg-surface',
  unscheduled: 'bg-surface',
}

const urgencyRank: Record<ItemUrgency, number> = { overdue: 0, 'due-soon': 1, unscheduled: 2, ok: 3 }

/** Case- and accent-insensitive form used by the search box. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function Dashboard() {
  const items = useItems()
  const purchases = usePurchases()
  const contributions = useContributions()
  const categories = useCategories()
  const settings = useSettings()
  const today = useToday()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showArchived, setShowArchived] = useState(false)
  const [showIncomplete, setShowIncomplete] = useState(false)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [showDeposit, setShowDeposit] = useState(false)
  /** null = follow the live monthly total (data may still be loading when opened from a notification). */
  const [depositAmount, setDepositAmount] = useState<string | null>(null)
  const [depositStatus, setDepositStatus] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<DeletedItemSnapshot | null>(null)

  const { activeItems, archivedItems, urgent, total, reserve, incomplete } = useMemo(() => {
    const active = (items ?? []).filter((i) => i.status === 'active')
    const breakdown = provisionBreakdown(active, purchases ?? [], settings, today)
    return {
      activeItems: active,
      archivedItems: (items ?? []).filter((i) => i.status === 'archived'),
      urgent: breakdown.urgent,
      total: breakdown.recurring + breakdown.urgent,
      reserve: reserveSummary(active, purchases ?? [], contributions ?? [], settings, today),
      incomplete: incompleteItems(active, purchases ?? []),
    }
  }, [items, purchases, contributions, settings, today])

  // The monthly digest notification links here with ?guardar=1.
  useEffect(() => {
    if (searchParams.get('guardar') === '1') {
      openDeposit()
      searchParams.delete('guardar')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ItemDetail hands the deleted item over through navigation state.
  useEffect(() => {
    const snapshot = (location.state as { deleted?: DeletedItemSnapshot } | null)?.deleted
    if (snapshot) {
      setDeleted(snapshot)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  async function undoDelete() {
    if (!deleted) return
    await db.transaction('rw', db.items, db.purchases, db.contributions, async () => {
      await db.items.put(deleted.item)
      await db.purchases.bulkPut(deleted.purchases)
      await db.contributions.bulkPut(deleted.contributions)
    })
    setDeleted(null)
  }

  function openDeposit() {
    setDepositAmount(null)
    setDepositStatus(null)
    setShowDeposit(true)
  }

  async function submitDeposit(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(depositValue)
    if (!(amount > 0)) return
    const shares = distributeDeposit(activeItems, purchases ?? [], contributions ?? [], settings, today, amount)
    if (shares.length === 0) {
      setDepositStatus('Nenhum item ativo para receber o valor.')
      return
    }
    const date = todayISO()
    await db.contributions.bulkAdd(
      shares.map((s) => ({ id: crypto.randomUUID(), itemId: s.itemId, date, amount: s.amount })),
    )
    setShowDeposit(false)
    setDepositStatus(`${formatBRL(amount)} em ${shares.length} ${shares.length === 1 ? 'item' : 'itens'}`)
  }

  const filterCategories = useMemo(
    () => (categories ?? []).filter((c) => !c.hidden && activeItems.some((i) => i.categoryId === c.id)),
    [categories, activeItems],
  )

  // Each card's numbers are computed once here, not again inside the list
  // (and the urgency used for sorting is no longer recomputed per comparison).
  const cards = useMemo(() => {
    const q = normalize(query.trim())
    return activeItems
      .filter((i) => !categoryFilter || i.categoryId === categoryFilter)
      .filter((i) => !q || normalize(i.name).includes(q))
      .map((item) => {
        const goal = targetCost(item, purchases ?? [], settings, today)
        const saved = savedForItem(item, purchases ?? [], contributions ?? [])
        return {
          item,
          urgency: urgencyOf(item, purchases ?? [], today, settings.reminderLeadDays),
          target: nextReplacementDate(item, purchases ?? []),
          provision: monthlyProvision(item, purchases ?? [], settings, today),
          goal,
          saved,
          savedPct: goal && goal > 0 ? Math.min(100, (saved / goal) * 100) : 0,
        }
      })
      .sort((a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency])
  }, [activeItems, purchases, contributions, settings, today, query, categoryFilter])

  async function reactivate(id: string) {
    await db.items.update(id, { status: 'active' })
  }

  const depositValue = depositAmount ?? (Math.round(total * 100) / 100).toFixed(2)
  const reservePct = reserve.goal > 0 ? Math.min(100, (reserve.saved / reserve.goal) * 100) : 0
  const expectedPct = reserve.goal > 0 ? Math.min(100, (reserve.expected / reserve.goal) * 100) : 0
  const behind = reserve.expected - reserve.saved

  return (
    <Screen title="Início">
      {deleted && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-ink py-1.5 pl-4 pr-1.5 text-paper">
          <p className="min-w-0 flex-1 truncate text-[13.5px]">“{deleted.item.name}” excluído</p>
          <button onClick={undoDelete} className="min-h-10 shrink-0 px-2 text-[13.5px] font-semibold text-accent-soft-line">
            Desfazer
          </button>
          <IconButton label="Dispensar aviso" onClick={() => setDeleted(null)} className="text-paper/70">
            <XMarkIcon className="h-5 w-5" />
          </IconButton>
        </div>
      )}

      <section>
        <p className="rotulo">Guardar por mês</p>
        <p className="mt-0.5 text-[34px] font-extrabold leading-tight tracking-[-0.5px] text-ink">{formatBRL(total)}</p>
        {urgent > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-[12.5px] font-medium text-alerta">
            <ClockIcon className="h-3.5 w-3.5" /> {formatBRL(urgent)} vencendo este mês
          </p>
        )}
      </section>

      {incomplete.length > 0 && (
        <div className="mt-4 rounded-xl bg-alerta-soft text-alerta">
          <button
            onClick={() => setShowIncomplete((v) => !v)}
            aria-expanded={showIncomplete}
            className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-[13.5px] font-semibold"
          >
            <ExclamationCircleIcon className="h-5 w-5 shrink-0" />
            <span className="flex-1">
              {incomplete.length} {incomplete.length === 1 ? 'item fora' : 'itens fora'} da conta
            </span>
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${showIncomplete ? 'rotate-180' : ''}`} />
          </button>
          {showIncomplete && (
            <ul className="flex flex-col gap-1 px-2 pb-2">
              {incomplete.map(({ item, missing }) => (
                <li key={item.id}>
                  <Link
                    to={`/itens/${item.id}/editar`}
                    className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-surface px-3 text-[13.5px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-ink">{item.name}</span>
                    <span className="shrink-0 text-[12px] font-medium">
                      {missing === 'date' ? 'sem data' : 'sem preço'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {reserve.goal > 0 && (
        <Card className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="rotulo">Reserva</p>
            {behind > 0.5 ? (
              <span className="rounded-full bg-alerta-soft px-2 py-0.5 text-[11.5px] font-semibold text-alerta">
                −{formatBRL(behind)}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[11.5px] font-semibold text-ok">
                <CheckCircleIcon className="h-3.5 w-3.5" /> Em dia
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-sub">
            <span className="text-[17px] font-bold text-ink">{formatBRL(reserve.saved)}</span> de {formatBRL(reserve.goal)}
          </p>
          <div
            className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2"
            title={`Previsto até hoje: ${formatBRL(reserve.expected)}`}
          >
            <div className="h-full rounded-full bg-ok transition-[width] duration-200" style={{ width: `${reservePct}%` }} />
            <div className="absolute top-0 h-full w-0.5 bg-ink/60" style={{ left: `calc(${expectedPct}% - 1px)` }} />
          </div>
        </Card>
      )}

      {activeItems.length > 0 && !showDeposit && (
        <Button onClick={openDeposit} className="mt-3 w-full">
          <BanknotesIcon className="h-5 w-5" /> Guardei este mês
        </Button>
      )}
      {showDeposit && (
        <Card className="mt-3">
          <form onSubmit={submitDeposit} className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="rotulo">Valor guardado (R$)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                autoFocus
                value={depositValue}
                onChange={(e) => setDepositAmount(e.target.value)}
                className={inputClass}
              />
            </label>
            <Button type="submit">Distribuir</Button>
            <IconButton label="Cancelar" onClick={() => setShowDeposit(false)} className="h-11 w-11">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </form>
        </Card>
      )}
      {depositStatus && (
        <p className="mt-2 flex items-center justify-center gap-1 text-[12.5px] font-medium text-ok">
          <CheckCircleIcon className="h-4 w-4" /> {depositStatus}
        </p>
      )}

      {activeItems.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar item"
              aria-label="Buscar item"
              className={`${inputClass} pl-9`}
            />
          </div>
          {filterCategories.length > 1 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filtrar por categoria">
              {[{ id: null, name: 'Todas' }, ...filterCategories].map((c) => {
                const active = categoryFilter === c.id
                return (
                  <button
                    key={c.id ?? 'all'}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setCategoryFilter(c.id)}
                    className={`min-h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium ${
                      active ? 'bg-accent-fill text-white' : 'bg-surface text-sub'
                    }`}
                  >
                    {c.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {activeItems.length === 0 && <Empty>Nenhum item ainda. Toque em + para adicionar.</Empty>}
        {activeItems.length > 0 && cards.length === 0 && <Empty>Nenhum item encontrado.</Empty>}
        {cards.map(({ item, urgency, target, provision, goal, saved, savedPct }) => {
          const category = categories?.find((c) => c.id === item.categoryId)
          const canQuickBuy = urgency === 'overdue' || urgency === 'due-soon'

          return (
            <div key={item.id} className={`flex items-center gap-3 rounded-xl p-3 ${urgencyBg[urgency]}`}>
              <Link to={`/itens/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                  <CategoryIcon name={item.icon ?? category?.icon ?? 'CubeIcon'} className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[15px] font-semibold text-ink">{item.name}</p>
                    <p className="shrink-0 text-[14px] font-semibold text-ink">
                      {provision != null ? formatBRL(provision) : '—'}
                    </p>
                  </div>
                  <p className="flex items-center gap-1 text-[12.5px] text-sub">
                    {urgency === 'overdue' ? (
                      <ExclamationTriangleIcon className="h-3.5 w-3.5 text-erro" />
                    ) : urgency === 'due-soon' ? (
                      <ClockIcon className="h-3.5 w-3.5 text-alerta" />
                    ) : (
                      <CalendarIcon className="h-3.5 w-3.5 text-faint" />
                    )}
                    {target ? formatDate(target) : 'sem data'}
                  </p>
                  {goal != null && goal > 0 && (
                    <div
                      className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-2"
                      title={`${formatBRL(saved)} de ${formatBRL(goal)} guardados`}
                    >
                      <div className="h-full rounded-full bg-ok" style={{ width: `${savedPct}%` }} />
                    </div>
                  )}
                </div>
              </Link>
              {canQuickBuy && (
                <Link
                  to={`/itens/${item.id}?comprar=1`}
                  aria-label={`Registrar compra de ${item.name}`}
                  title="Registrar compra"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-accent"
                >
                  <ShoppingCartIcon className="h-5 w-5" />
                </Link>
              )}
            </div>
          )
        })}
      </div>

      {archivedItems.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
            className="flex min-h-11 items-center gap-1.5 text-[13px] font-medium text-sub"
          >
            <ArchiveBoxIcon className="h-4 w-4" />
            Arquivados ({archivedItems.length})
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
          </button>
          {showArchived && (
            <div className="mt-1 flex flex-col gap-2">
              {archivedItems.map((item) => {
                const category = categories?.find((c) => c.id === item.categoryId)
                return (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl bg-surface p-3 opacity-70">
                    <Link to={`/itens/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
                        <CategoryIcon name={item.icon ?? category?.icon ?? 'CubeIcon'} className="h-4 w-4 text-sub" />
                      </div>
                      <p className="truncate text-[14px] text-sub">{item.name}</p>
                    </Link>
                    <IconButton label={`Reativar ${item.name}`} onClick={() => reactivate(item.id)}>
                      <ArchiveBoxArrowDownIcon className="h-5 w-5" />
                    </IconButton>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Screen>
  )
}
