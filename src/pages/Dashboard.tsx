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
import { useToday } from '../hooks/useToday'
import type { Contribution, Item, Purchase } from '../domain/types'
import {
  ExclamationTriangleIcon,
  ClockIcon,
  ShoppingCartIcon,
  ArchiveBoxArrowDownIcon,
  BanknotesIcon,
  MagnifyingGlassIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/solid'

/** Everything removed with an item, kept around so the delete can be undone. */
interface DeletedItemSnapshot {
  item: Item
  purchases: Purchase[]
  contributions: Contribution[]
}

const urgencyStyle: Record<ItemUrgency, string> = {
  overdue: 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950',
  'due-soon': 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
  ok: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
  unscheduled: 'border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900',
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
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [showDeposit, setShowDeposit] = useState(false)
  /** null = follow the live monthly total (data may still be loading when opened from a notification). */
  const [depositAmount, setDepositAmount] = useState<string | null>(null)
  const [depositStatus, setDepositStatus] = useState<string | null>(null)
  const [deleted, setDeleted] = useState<DeletedItemSnapshot | null>(null)

  const { activeItems, archivedItems, recurring, urgent, total, reserve, incomplete } = useMemo(() => {
    const active = (items ?? []).filter((i) => i.status === 'active')
    const breakdown = provisionBreakdown(active, purchases ?? [], settings, today)
    return {
      activeItems: active,
      archivedItems: (items ?? []).filter((i) => i.status === 'archived'),
      recurring: breakdown.recurring,
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
      setDepositStatus('Nenhum item ativo com provisão para receber o valor.')
      return
    }
    const date = todayISO()
    await db.contributions.bulkAdd(
      shares.map((s) => ({ id: crypto.randomUUID(), itemId: s.itemId, date, amount: s.amount })),
    )
    setShowDeposit(false)
    setDepositStatus(
      `${formatBRL(amount)} distribuído entre ${shares.length} ${shares.length === 1 ? 'item' : 'itens'}.`,
    )
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
    <div className="px-4 pt-6">
      {deleted && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
            “{deleted.item.name}” foi excluído.
          </p>
          <button
            onClick={undoDelete}
            className="min-h-11 shrink-0 rounded-lg border border-violet-300 px-3 text-sm font-semibold text-violet-700 dark:border-violet-800 dark:text-violet-300"
          >
            Desfazer
          </button>
          <button
            onClick={() => setDeleted(null)}
            aria-label="Dispensar aviso"
            className="min-h-11 shrink-0 px-2 text-sm text-slate-500"
          >
            ✕
          </button>
        </div>
      )}

      <h1 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        Guardar por mês
      </h1>
      <p className="mt-1 text-4xl font-extrabold text-slate-900 dark:text-slate-50">{formatBRL(total)}</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Soma da provisão de {activeItems.length} {activeItems.length === 1 ? 'item ativo' : 'itens ativos'}
      </p>
      {urgent > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {formatBRL(recurring)} recorrente + <span className="font-semibold text-amber-600 dark:text-amber-400">{formatBRL(urgent)} de itens vencendo este mês</span>
        </p>
      )}

      {incomplete.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <ExclamationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {incomplete.length === 1
                ? '1 item está fora da conta'
                : `${incomplete.length} itens estão fora da conta`}{' '}
              — o total acima está menor do que a realidade.
            </span>
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {incomplete.map(({ item, missing }) => (
              <li key={item.id}>
                <Link
                  to={`/itens/${item.id}/editar`}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-white px-3 text-sm dark:bg-slate-900"
                >
                  <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">{item.name}</span>
                  <span className="shrink-0 text-xs font-medium text-amber-800 dark:text-amber-300">
                    {missing === 'date' ? 'falta a data da última compra' : 'falta o preço'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {reserve.goal > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs text-slate-500">Reserva guardada</p>
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{formatBRL(reserve.saved)}</span> de{' '}
              {formatBRL(reserve.expected)} previstos até hoje
            </p>
          </div>
          <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${reservePct}%` }} />
            <div
              className="absolute top-0 h-full w-0.5 bg-slate-500 dark:bg-slate-300"
              style={{ left: `calc(${expectedPct}% - 1px)` }}
              title="Previsto até hoje"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {behind > 0.5 ? (
              <>
                <span className="font-semibold text-amber-600 dark:text-amber-400">{formatBRL(behind)} abaixo</span> do
                plano · meta total {formatBRL(reserve.goal)}
              </>
            ) : (
              <>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Em dia</span> · meta total{' '}
                {formatBRL(reserve.goal)}
              </>
            )}
          </p>
        </div>
      )}

      {activeItems.length > 0 && !showDeposit && (
        <button
          onClick={openDeposit}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white active:bg-violet-700"
        >
          <BanknotesIcon className="h-4 w-4" /> Guardei este mês
        </button>
      )}
      {showDeposit && (
        <form
          onSubmit={submitDeposit}
          className="mt-3 flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950"
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Quanto você guardou este mês? (R$)
            <input
              type="number"
              min={0}
              step="0.01"
              required
              autoFocus
              value={depositValue}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            />
            <span className="text-xs font-normal text-slate-500">
              O valor é dividido entre os itens na proporção do quanto cada um precisa por mês.
            </span>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white">
              Distribuir
            </button>
            <button
              type="button"
              onClick={() => setShowDeposit(false)}
              className="rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      {depositStatus && <p className="mt-2 text-center text-xs text-emerald-600 dark:text-emerald-400">{depositStatus}</p>}

      {activeItems.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar item"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-base text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
            />
          </div>
          {filterCategories.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {[{ id: null, name: 'Todas' }, ...filterCategories].map((c) => {
                const active = categoryFilter === c.id
                return (
                  <button
                    key={c.id ?? 'all'}
                    onClick={() => setCategoryFilter(c.id)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
                      active
                        ? 'border-violet-600 bg-violet-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
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
        {activeItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            Nenhum item cadastrado ainda. Toque em “Novo item” para começar.
          </div>
        )}
        {activeItems.length > 0 && cards.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">Nenhum item encontrado.</p>
        )}
        {cards.map(({ item, urgency, target, provision, goal, saved, savedPct }) => {
          const category = categories?.find((c) => c.id === item.categoryId)
          const canQuickBuy = urgency === 'overdue' || urgency === 'due-soon'

          return (
            <div key={item.id} className={`flex items-center gap-3 rounded-xl border p-3 ${urgencyStyle[urgency]}`}>
              <Link to={`/itens/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900">
                  <CategoryIcon name={item.icon ?? category?.icon ?? 'CubeIcon'} className="h-5 w-5 text-violet-600 dark:text-violet-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{item.name}</p>
                    <p className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {provision != null ? formatBRL(provision) : '—'}
                    </p>
                  </div>
                  <p className="flex items-center gap-1 text-xs text-slate-500">
                    {urgency === 'overdue' && <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-500" />}
                    {urgency === 'due-soon' && <ClockIcon className="h-3.5 w-3.5 text-amber-500" />}
                    {target ? `Trocar em ${formatDate(target)}` : 'Data de compra não informada'}
                  </p>
                  {goal != null && goal > 0 && (
                    <div
                      className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800"
                      title={`${formatBRL(saved)} de ${formatBRL(goal)} guardados`}
                    >
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${savedPct}%` }} />
                    </div>
                  )}
                </div>
              </Link>
              {canQuickBuy && (
                <Link
                  to={`/itens/${item.id}?comprar=1`}
                  aria-label={`Registrar compra de ${item.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-violet-300 text-violet-600 dark:border-violet-800 dark:text-violet-300"
                >
                  <ShoppingCartIcon className="h-4 w-4" />
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
            className="min-h-11 text-sm font-medium text-slate-600 underline decoration-dotted dark:text-slate-400"
          >
            {showArchived ? 'Ocultar' : 'Mostrar'} arquivados ({archivedItems.length})
          </button>
          {showArchived && (
            <div className="mt-2 flex flex-col gap-2">
              {archivedItems.map((item) => {
                const category = categories?.find((c) => c.id === item.categoryId)
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <Link to={`/itens/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <CategoryIcon name={item.icon ?? category?.icon ?? 'CubeIcon'} className="h-4.5 w-4.5 text-slate-500" />
                      </div>
                      <p className="truncate text-sm text-slate-600 dark:text-slate-400">{item.name}</p>
                    </Link>
                    <button
                      onClick={() => reactivate(item.id)}
                      aria-label={`Reativar ${item.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 dark:border-slate-700"
                    >
                      <ArchiveBoxArrowDownIcon className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
