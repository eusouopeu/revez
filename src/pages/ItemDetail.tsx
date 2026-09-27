import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useCategories, useContributionsForItem, useItems, usePurchasesForItem, useSettings } from '../hooks/useAppData'
import { db } from '../db/db'
import {
  activePostponementMonths,
  monthlyProvision,
  nextReplacementDate,
  observedLifespanMonths,
  postponementFor,
  projectedPrice,
  savedForItem,
  settleCycle,
  targetCost,
  urgencyOf,
  type CycleSettlement,
} from '../domain/calculations'
import { formatBRL, formatDate, todayISO } from '../domain/format'
import { useToday } from '../hooks/useToday'
import { CategoryIcon } from '../components/IconBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ArrowLeftIcon, PencilIcon, TrashIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'

interface PendingConfirm {
  title: string
  message?: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
}

export function ItemDetail() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const items = useItems()
  const categories = useCategories()
  const settings = useSettings()
  const purchases = usePurchasesForItem(id ?? '')
  const contributions = useContributionsForItem(id ?? '')
  const today = useToday()

  const [showPurchaseForm, setShowPurchaseForm] = useState(searchParams.get('comprar') === '1')
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [purchaseQuantity, setPurchaseQuantity] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  /** Set right after a purchase closes a cycle, to show what was left over or missing. */
  const [settlement, setSettlement] = useState<(CycleSettlement & { date: string }) | null>(null)

  const [showContributionForm, setShowContributionForm] = useState(false)
  const [contributionAmount, setContributionAmount] = useState('')
  const [contributionDate, setContributionDate] = useState(todayISO())
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null)

  useEffect(() => {
    if (searchParams.get('comprar') === '1') {
      setShowPurchaseForm(true)
      searchParams.delete('comprar')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = items?.find((i) => i.id === id)

  const derived = useMemo(() => {
    if (!item) return undefined
    const goal = targetCost(item, purchases, settings, today)
    const saved = savedForItem(item, purchases, contributions)
    const observed = observedLifespanMonths(item, purchases)
    const observedRounded = observed != null ? Math.max(1, Math.round(observed)) : undefined
    return {
      target: nextReplacementDate(item, purchases),
      projected: projectedPrice(item, purchases, settings, today),
      provision: monthlyProvision(item, purchases, settings, today),
      saved,
      goal,
      progressPct: goal && goal > 0 ? Math.min(100, (saved / goal) * 100) : 0,
      urgency: urgencyOf(item, purchases, today, settings.reminderLeadDays),
      postponedMonths: activePostponementMonths(item, purchases),
      observedRounded,
      suggestLifespan:
        observedRounded != null &&
        Math.abs(observedRounded - item.lifespanMonths) >= Math.max(2, item.lifespanMonths * 0.2),
    }
  }, [item, purchases, contributions, settings, today])

  if (!item || !derived) return null

  const category = categories?.find((c) => c.id === item.categoryId)
  const { target, projected, provision, saved, goal, progressPct, urgency, postponedMonths, observedRounded, suggestLifespan } =
    derived

  async function postpone(months: number) {
    if (!item) return
    const postponement = postponementFor(item, purchases, today, months)
    if (postponement) await db.items.update(item.id, { postponement })
  }

  async function undoPostpone() {
    if (!item) return
    await db.items.update(item.id, { postponement: undefined })
  }

  async function applyObservedLifespan() {
    if (!item || observedRounded == null) return
    await db.items.update(item.id, { lifespanMonths: observedRounded })
  }

  function startEditPurchase(p: { id: string; date: string; unitPrice: number; quantity: number; note?: string }) {
    setEditingPurchaseId(p.id)
    setDate(p.date)
    setPrice(p.unitPrice.toString())
    setPurchaseQuantity(p.quantity.toString())
    setNote(p.note ?? '')
    setShowPurchaseForm(true)
  }

  function cancelPurchaseForm() {
    setShowPurchaseForm(false)
    setEditingPurchaseId(null)
    setPrice('')
    setPurchaseQuantity('')
    setNote('')
    setDate(todayISO())
  }

  async function submitPurchase(e: React.FormEvent) {
    e.preventDefault()
    if (!price || !item) return
    const quantity = Math.max(1, Number(purchaseQuantity) || item.quantity)
    if (editingPurchaseId) {
      await db.purchases.update(editingPurchaseId, {
        date,
        unitPrice: Number(price),
        quantity,
        note: note.trim() || undefined,
      })
    } else {
      // Settle the cycle this purchase closes before its anchor moves.
      const closing = settleCycle(saved, Number(price) * quantity)
      await db.purchases.add({
        id: crypto.randomUUID(),
        itemId: item.id,
        date,
        unitPrice: Number(price),
        quantity,
        note: note.trim() || undefined,
      })
      setSettlement(closing.saved > 0 ? { ...closing, date } : null)
    }
    cancelPurchaseForm()
  }

  async function carryLeftover() {
    if (!item || !settlement) return
    await db.contributions.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      date: settlement.date,
      amount: settlement.leftover,
    })
    setSettlement(null)
  }

  function removePurchase(purchaseId: string) {
    setConfirming({
      title: 'Excluir esta compra?',
      message: 'Ela sai do histórico e a data da próxima troca é recalculada.',
      confirmLabel: 'Excluir',
      onConfirm: () => db.purchases.delete(purchaseId),
    })
  }

  async function submitContribution(e: React.FormEvent) {
    e.preventDefault()
    if (!contributionAmount || !item) return
    await db.contributions.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      date: contributionDate,
      amount: Number(contributionAmount),
    })
    setShowContributionForm(false)
    setContributionAmount('')
    setContributionDate(todayISO())
  }

  function removeContribution(contributionId: string) {
    setConfirming({
      title: 'Excluir este aporte?',
      confirmLabel: 'Excluir',
      onConfirm: () => db.contributions.delete(contributionId),
    })
  }

  async function archive() {
    if (!item) return
    await db.items.update(item.id, { status: item.status === 'active' ? 'archived' : 'active' })
  }

  function remove() {
    if (!item) return
    setConfirming({
      title: `Excluir "${item.name}"?`,
      message: 'O histórico de compras e os aportes vão junto. Dá para desfazer logo depois.',
      confirmLabel: 'Excluir',
      onConfirm: async () => {
        // Snapshot first: the dashboard offers to put it all back.
        const snapshot = { item, purchases: [...purchases], contributions: [...contributions] }
        await db.purchases.where('itemId').equals(item.id).delete()
        await db.contributions.where('itemId').equals(item.id).delete()
        await db.items.delete(item.id)
        navigate('/', { state: { deleted: snapshot } })
      },
    })
  }

  const iconButton =
    'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 px-3 dark:border-slate-700'

  return (
    <div className="px-4 pt-6">
      <button onClick={() => navigate(-1)} className="mb-4 flex min-h-11 items-center gap-1 text-sm text-slate-500">
        <ArrowLeftIcon className="h-4 w-4" /> Voltar
      </button>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900">
          <CategoryIcon name={item.icon ?? category?.icon ?? 'CubeIcon'} className="h-6 w-6 text-violet-600 dark:text-violet-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{item.name}</h1>
          <p className="text-sm text-slate-500">
            {category?.name}
            {item.quantity > 1 && ` · ${item.quantity} unidades`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-xs text-slate-500">Próxima troca</p>
          <p className="font-semibold text-slate-900 dark:text-slate-50">
            {target ? formatDate(target) : 'sem data'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-xs text-slate-500">Preço projetado</p>
          <p className="font-semibold text-slate-900 dark:text-slate-50">
            {projected != null ? formatBRL(projected) : '—'}
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950">
          <p className="text-xs text-violet-700 dark:text-violet-300">Guardar por mês</p>
          <p className="text-lg font-bold text-violet-700 dark:text-violet-200">
            {provision != null ? formatBRL(provision) : '—'}
          </p>
        </div>
      </div>

      {settlement && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950">
          <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Fechamento do ciclo</p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            Você tinha {formatBRL(settlement.saved)} guardado e a compra custou {formatBRL(settlement.paid)}.
          </p>
          {settlement.leftover > 0 ? (
            <>
              <p className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Sobra de {formatBRL(settlement.leftover)}.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={carryLeftover}
                  className="min-h-11 flex-1 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white"
                >
                  Levar para o próximo ciclo
                </button>
                <button
                  onClick={() => setSettlement(null)}
                  className="min-h-11 flex-1 rounded-lg border border-emerald-300 px-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:text-emerald-200"
                >
                  Retirei o dinheiro
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                {settlement.shortfall > 0
                  ? `Faltaram ${formatBRL(settlement.shortfall)}, que saíram de outro lugar.`
                  : 'A reserva cobriu exatamente a compra.'}
              </p>
              <button
                onClick={() => setSettlement(null)}
                className="mt-2 min-h-11 w-full rounded-lg border border-emerald-300 px-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:text-emerald-200"
              >
                Entendi
              </button>
            </>
          )}
        </div>
      )}

      {item.status === 'active' && (urgency === 'overdue' || urgency === 'due-soon') && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Ainda está bom?</p>
          <p className="text-xs text-amber-800 dark:text-amber-300">Adie a troca sem registrar compra.</p>
          <div className="mt-2 flex gap-2">
            {[1, 3, 6].map((m) => (
              <button
                key={m}
                onClick={() => postpone(m)}
                aria-label={`Adiar a troca em ${m} ${m === 1 ? 'mês' : 'meses'}`}
                className="min-h-11 flex-1 rounded-lg border border-amber-300 bg-white text-sm font-semibold text-amber-800 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300"
              >
                +{m} {m === 1 ? 'mês' : 'meses'}
              </button>
            ))}
          </div>
        </div>
      )}

      {postponedMonths > 0 && (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Troca adiada em {postponedMonths} {postponedMonths === 1 ? 'mês' : 'meses'} neste ciclo.{' '}
          <button onClick={undoPostpone} className="font-medium text-violet-700 underline dark:text-violet-400">
            Desfazer
          </button>
        </p>
      )}

      {suggestLifespan && (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950">
          <p className="text-sky-900 dark:text-sky-200">
            Pelo histórico, este item tem durado cerca de <strong>{observedRounded} meses</strong>, não{' '}
            {item.lifespanMonths}.
          </p>
          <button
            onClick={applyObservedLifespan}
            className="mt-2 min-h-11 rounded-lg bg-sky-700 px-3 text-xs font-semibold text-white"
          >
            Ajustar vida útil para {observedRounded} meses
          </button>
        </div>
      )}

      {goal != null && goal > 0 && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-slate-600 dark:text-slate-400">Guardado para a próxima troca</p>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {formatBRL(saved)} de {formatBRL(goal)}
            </p>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => (showPurchaseForm ? cancelPurchaseForm() : setShowPurchaseForm(true))}
          className="min-h-11 flex-1 rounded-lg bg-violet-600 text-sm font-semibold text-white"
        >
          Registrar compra
        </button>
        <Link to={`/itens/${item.id}/editar`} aria-label="Editar item" className={iconButton}>
          <PencilIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        </Link>
        <button
          onClick={archive}
          aria-label={item.status === 'active' ? 'Arquivar item' : 'Reativar item'}
          className={iconButton}
        >
          <ArchiveBoxIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        </button>
        <button
          onClick={remove}
          aria-label="Excluir item"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-red-300 px-3 text-red-600 dark:border-red-900 dark:text-red-400"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {item.status === 'archived' && (
        <p className="mt-2 text-center text-xs font-medium text-amber-700 dark:text-amber-400">
          Item arquivado — fora do total mensal
        </p>
      )}

      {showPurchaseForm && (
        <form onSubmit={submitPurchase} className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Data
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Preço unitário (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              Quantidade comprada
              <input
                type="number"
                min={1}
                value={purchaseQuantity}
                onChange={(e) => setPurchaseQuantity(e.target.value)}
                placeholder={item.quantity.toString()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <div className="flex flex-col justify-end pb-2">
              <p className="text-xs text-slate-600 dark:text-slate-400">Total desta compra</p>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
                {formatBRL(Number(price || 0) * Math.max(1, Number(purchaseQuantity) || item.quantity))}
              </p>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Observação
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="opcional — marca, loja, modelo…"
              className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="min-h-11 flex-1 rounded-lg bg-slate-900 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              {editingPurchaseId ? 'Salvar alterações' : 'Salvar compra'}
            </button>
            <button
              type="button"
              onClick={cancelPurchaseForm}
              className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Histórico de compras</h2>
        {purchases.length === 0 && <p className="text-sm text-slate-500">Nenhuma compra registrada ainda.</p>}
        <ul className="flex flex-col gap-2">
          {[...purchases].reverse().map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <span className="min-w-0 flex-1">
                <span className="block text-slate-600 dark:text-slate-300">{formatDate(p.date)}</span>
                {p.note && <span className="block truncate text-xs text-slate-500">{p.note}</span>}
              </span>
              <span className="text-right">
                <span className="block font-medium text-slate-900 dark:text-slate-50">
                  {formatBRL(p.unitPrice * p.quantity)}
                </span>
                {p.quantity > 1 && (
                  <span className="block text-xs text-slate-500">
                    {p.quantity} × {formatBRL(p.unitPrice)}
                  </span>
                )}
              </span>
              <button
                onClick={() => startEditPurchase(p)}
                aria-label={`Editar compra de ${formatDate(p.date)}`}
                className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => removePurchase(p.id)}
                aria-label={`Excluir compra de ${formatDate(p.date)}`}
                className="flex min-h-11 min-w-11 items-center justify-center text-red-500 hover:text-red-700"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Aportes guardados</h2>
          <button
            onClick={() => setShowContributionForm((v) => !v)}
            className="min-h-11 text-xs font-medium text-violet-700 dark:text-violet-400"
          >
            {showContributionForm ? 'Cancelar' : '+ Registrar aporte'}
          </button>
        </div>

        {showContributionForm && (
          <form onSubmit={submitContribution} className="mb-3 flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                Data
                <input
                  type="date"
                  value={contributionDate}
                  onChange={(e) => setContributionDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                Valor (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            </div>
            <button type="submit" className="min-h-11 rounded-lg bg-slate-900 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              Salvar aporte
            </button>
          </form>
        )}

        {contributions.length === 0 && !showContributionForm && (
          <p className="text-sm text-slate-500">Nenhum aporte registrado neste ciclo.</p>
        )}
        <ul className="flex flex-col gap-2">
          {[...contributions].reverse().map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">{formatDate(c.date)}</span>
              <span className="flex-1 text-right font-medium text-slate-900 dark:text-slate-50">{formatBRL(c.amount)}</span>
              <button
                onClick={() => removeContribution(c.id)}
                aria-label={`Excluir aporte de ${formatDate(c.date)}`}
                className="flex min-h-11 min-w-11 items-center justify-center text-red-500 hover:text-red-700"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={confirming != null}
        title={confirming?.title ?? ''}
        message={confirming?.message}
        confirmLabel={confirming?.confirmLabel}
        destructive
        onConfirm={async () => {
          const pending = confirming
          setConfirming(null)
          await pending?.onConfirm()
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}
