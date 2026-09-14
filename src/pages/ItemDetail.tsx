import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
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
  targetCost,
  urgencyOf,
} from '../domain/calculations'
import { formatBRL, formatDate, todayISO } from '../domain/format'
import { CategoryIcon } from '../components/IconBadge'
import { ArrowLeftIcon, PencilIcon, TrashIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'

export function ItemDetail() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const items = useItems()
  const categories = useCategories()
  const settings = useSettings()
  const purchases = usePurchasesForItem(id ?? '')
  const contributions = useContributionsForItem(id ?? '')

  const [showPurchaseForm, setShowPurchaseForm] = useState(searchParams.get('comprar') === '1')
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')

  const [showContributionForm, setShowContributionForm] = useState(false)
  const [contributionAmount, setContributionAmount] = useState('')
  const [contributionDate, setContributionDate] = useState(todayISO())

  useEffect(() => {
    if (searchParams.get('comprar') === '1') {
      setShowPurchaseForm(true)
      searchParams.delete('comprar')
      setSearchParams(searchParams, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = items?.find((i) => i.id === id)
  if (!item) return null

  const category = categories?.find((c) => c.id === item.categoryId)
  const today = new Date()
  const target = nextReplacementDate(item, purchases)
  const projected = projectedPrice(item, purchases, settings, today)
  const provision = monthlyProvision(item, purchases, settings, today)
  const saved = savedForItem(item, purchases, contributions)
  const goal = targetCost(item, purchases, settings, today)
  const progressPct = goal && goal > 0 ? Math.min(100, (saved / goal) * 100) : 0
  const urgency = urgencyOf(item, purchases, today, settings.reminderLeadDays)
  const postponedMonths = activePostponementMonths(item, purchases)
  const observed = observedLifespanMonths(item, purchases)
  const observedRounded = observed != null ? Math.max(1, Math.round(observed)) : undefined
  const suggestLifespan =
    observedRounded != null &&
    Math.abs(observedRounded - item.lifespanMonths) >= Math.max(2, item.lifespanMonths * 0.2)

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

  function startEditPurchase(p: { id: string; date: string; unitPrice: number; note?: string }) {
    setEditingPurchaseId(p.id)
    setDate(p.date)
    setPrice(p.unitPrice.toString())
    setNote(p.note ?? '')
    setShowPurchaseForm(true)
  }

  function cancelPurchaseForm() {
    setShowPurchaseForm(false)
    setEditingPurchaseId(null)
    setPrice('')
    setNote('')
    setDate(todayISO())
  }

  async function submitPurchase(e: React.FormEvent) {
    e.preventDefault()
    if (!price || !item) return
    if (editingPurchaseId) {
      await db.purchases.update(editingPurchaseId, { date, unitPrice: Number(price), note: note.trim() || undefined })
    } else {
      await db.purchases.add({
        id: crypto.randomUUID(),
        itemId: item.id,
        date,
        unitPrice: Number(price),
        quantity: item.quantity,
        note: note.trim() || undefined,
      })
    }
    cancelPurchaseForm()
  }

  async function removePurchase(purchaseId: string) {
    if (!confirm('Excluir esta compra do histórico?')) return
    await db.purchases.delete(purchaseId)
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

  async function removeContribution(contributionId: string) {
    if (!confirm('Excluir este aporte?')) return
    await db.contributions.delete(contributionId)
  }

  async function archive() {
    if (!item) return
    await db.items.update(item.id, { status: item.status === 'active' ? 'archived' : 'active' })
  }

  async function remove() {
    if (!item) return
    if (!confirm(`Excluir "${item.name}" e todo o histórico de compras?`)) return
    await db.purchases.where('itemId').equals(item.id).delete()
    await db.contributions.where('itemId').equals(item.id).delete()
    await db.items.delete(item.id)
    navigate('/')
  }

  return (
    <div className="px-4 pt-6">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeftIcon className="h-4 w-4" /> Voltar
      </button>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900">
          <CategoryIcon name={item.icon ?? category?.icon ?? 'CubeIcon'} className="h-6 w-6 text-violet-600 dark:text-violet-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{item.name}</h1>
          <p className="text-sm text-slate-500">{category?.name}</p>
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
          <p className="text-xs text-violet-600 dark:text-violet-300">Guardar por mês</p>
          <p className="text-lg font-bold text-violet-700 dark:text-violet-200">
            {provision != null ? formatBRL(provision) : '—'}
          </p>
        </div>
      </div>

      {item.status === 'active' && (urgency === 'overdue' || urgency === 'due-soon') && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Ainda está bom?</p>
          <p className="text-xs text-amber-700 dark:text-amber-300">Adie a troca sem registrar compra.</p>
          <div className="mt-2 flex gap-2">
            {[1, 3, 6].map((m) => (
              <button
                key={m}
                onClick={() => postpone(m)}
                className="flex-1 rounded-lg border border-amber-300 bg-white py-1.5 text-sm font-semibold text-amber-700 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300"
              >
                +{m} {m === 1 ? 'mês' : 'meses'}
              </button>
            ))}
          </div>
        </div>
      )}

      {postponedMonths > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Troca adiada em {postponedMonths} {postponedMonths === 1 ? 'mês' : 'meses'} neste ciclo.{' '}
          <button onClick={undoPostpone} className="font-medium text-violet-600 underline dark:text-violet-400">
            Desfazer
          </button>
        </p>
      )}

      {suggestLifespan && (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950">
          <p className="text-sky-800 dark:text-sky-200">
            Pelo histórico, este item tem durado cerca de <strong>{observedRounded} meses</strong>, não{' '}
            {item.lifespanMonths}.
          </p>
          <button
            onClick={applyObservedLifespan}
            className="mt-2 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Ajustar vida útil para {observedRounded} meses
          </button>
        </div>
      )}

      {goal != null && goal > 0 && (
        <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-slate-500">Guardado para a próxima troca</p>
            <p className="text-xs font-medium text-slate-500">
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
          className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white"
        >
          Registrar compra
        </button>
        <Link
          to={`/itens/${item.id}/editar`}
          className="flex items-center justify-center rounded-lg border border-slate-300 px-3 dark:border-slate-700"
        >
          <PencilIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        </Link>
        <button
          onClick={archive}
          className="flex items-center justify-center rounded-lg border border-slate-300 px-3 dark:border-slate-700"
        >
          <ArchiveBoxIcon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
        </button>
        <button
          onClick={remove}
          className="flex items-center justify-center rounded-lg border border-red-300 px-3 text-red-500 dark:border-red-900"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {item.status === 'archived' && (
        <p className="mt-2 text-center text-xs font-medium text-amber-600">Item arquivado — fora do total mensal</p>
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
            <button type="submit" className="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              {editingPurchaseId ? 'Salvar alterações' : 'Salvar compra'}
            </button>
            <button
              type="button"
              onClick={cancelPurchaseForm}
              className="rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Histórico de compras</h2>
        {purchases.length === 0 && <p className="text-sm text-slate-400">Nenhuma compra registrada ainda.</p>}
        <ul className="flex flex-col gap-2">
          {[...purchases].reverse().map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <span className="min-w-0 flex-1">
                <span className="block text-slate-600 dark:text-slate-300">{formatDate(p.date)}</span>
                {p.note && <span className="block truncate text-xs text-slate-400">{p.note}</span>}
              </span>
              <span className="text-right font-medium text-slate-900 dark:text-slate-50">{formatBRL(p.unitPrice)}</span>
              <button onClick={() => startEditPurchase(p)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <PencilIcon className="h-4 w-4" />
              </button>
              <button onClick={() => removePurchase(p.id)} className="text-red-400 hover:text-red-600">
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
            className="text-xs font-medium text-violet-600 dark:text-violet-400"
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
            <button type="submit" className="rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              Salvar aporte
            </button>
          </form>
        )}

        {contributions.length === 0 && !showContributionForm && (
          <p className="text-sm text-slate-400">Nenhum aporte registrado neste ciclo.</p>
        )}
        <ul className="flex flex-col gap-2">
          {[...contributions].reverse().map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">{formatDate(c.date)}</span>
              <span className="flex-1 text-right font-medium text-slate-900 dark:text-slate-50">{formatBRL(c.amount)}</span>
              <button onClick={() => removeContribution(c.id)} className="text-red-400 hover:text-red-600">
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
