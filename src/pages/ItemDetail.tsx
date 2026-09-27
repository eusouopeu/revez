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
import { Button } from '../components/Button'
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

  const iconButton = 'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line-strong px-3'

  return (
    <div className="px-4 pt-6">
      <button onClick={() => navigate(-1)} className="mb-4 flex min-h-11 items-center gap-1 text-sm text-sub">
        <ArrowLeftIcon className="h-4 w-4" /> Voltar
      </button>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft">
          <CategoryIcon name={item.icon ?? category?.icon ?? 'CubeIcon'} className="h-6 w-6 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink">{item.name}</h1>
          <p className="text-sm text-sub">
            {category?.name}
            {item.quantity > 1 && ` · ${item.quantity} unidades`}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line p-3">
          <p className="text-xs text-sub">Próxima troca</p>
          <p className="font-semibold text-ink">
            {target ? formatDate(target) : 'sem data'}
          </p>
        </div>
        <div className="rounded-xl border border-line p-3">
          <p className="text-xs text-sub">Preço projetado</p>
          <p className="font-semibold text-ink">
            {projected != null ? formatBRL(projected) : '—'}
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-accent-soft-line bg-accent-soft p-3">
          <p className="text-xs text-accent-strong">Guardar por mês</p>
          <p className="text-lg font-bold text-accent-strong">
            {provision != null ? formatBRL(provision) : '—'}
          </p>
        </div>
      </div>

      {settlement && (
        <div className="mt-3 rounded-xl border border-ok-soft-line bg-ok-soft p-3">
          <p className="text-sm font-medium text-ok">Fechamento do ciclo</p>
          <p className="mt-1 text-sm text-ok">
            Você tinha {formatBRL(settlement.saved)} guardado e a compra custou {formatBRL(settlement.paid)}.
          </p>
          {settlement.leftover > 0 ? (
            <>
              <p className="mt-1 text-sm font-semibold text-ok">
                Sobra de {formatBRL(settlement.leftover)}.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={carryLeftover}
                  className="min-h-11 flex-1 rounded-lg bg-ok px-3 text-sm font-semibold text-white"
                >
                  Levar para o próximo ciclo
                </button>
                <button
                  onClick={() => setSettlement(null)}
                  className="min-h-11 flex-1 rounded-lg border border-ok-soft-line px-3 text-sm font-semibold text-ok"
                >
                  Retirei o dinheiro
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-semibold text-ok">
                {settlement.shortfall > 0
                  ? `Faltaram ${formatBRL(settlement.shortfall)}, que saíram de outro lugar.`
                  : 'A reserva cobriu exatamente a compra.'}
              </p>
              <button
                onClick={() => setSettlement(null)}
                className="mt-2 min-h-11 w-full rounded-lg border border-ok-soft-line px-3 text-sm font-semibold text-ok"
              >
                Entendi
              </button>
            </>
          )}
        </div>
      )}

      {item.status === 'active' && (urgency === 'overdue' || urgency === 'due-soon') && (
        <div className="mt-3 rounded-xl border border-alerta-soft-line bg-alerta-soft p-3">
          <p className="text-sm font-medium text-alerta">Ainda está bom?</p>
          <p className="text-xs text-alerta">Adie a troca sem registrar compra.</p>
          <div className="mt-2 flex gap-2">
            {[1, 3, 6].map((m) => (
              <button
                key={m}
                onClick={() => postpone(m)}
                aria-label={`Adiar a troca em ${m} ${m === 1 ? 'mês' : 'meses'}`}
                className="min-h-11 flex-1 rounded-lg border border-alerta-soft-line bg-surface text-sm font-semibold text-alerta"
              >
                +{m} {m === 1 ? 'mês' : 'meses'}
              </button>
            ))}
          </div>
        </div>
      )}

      {postponedMonths > 0 && (
        <p className="mt-2 text-xs text-sub">
          Troca adiada em {postponedMonths} {postponedMonths === 1 ? 'mês' : 'meses'} neste ciclo.{' '}
          <button onClick={undoPostpone} className="font-medium text-accent-strong underline">
            Desfazer
          </button>
        </p>
      )}

      {suggestLifespan && (
        <div className="mt-3 rounded-xl border border-alerta-soft-line bg-alerta-soft p-3 text-sm">
          <p className="text-alerta">
            Pelo histórico, este item tem durado cerca de <strong>{observedRounded} meses</strong>, não{' '}
            {item.lifespanMonths}.
          </p>
          <button
            onClick={applyObservedLifespan}
            className="mt-2 min-h-11 rounded-lg bg-alerta px-3 text-xs font-semibold text-white"
          >
            Ajustar vida útil para {observedRounded} meses
          </button>
        </div>
      )}

      {goal != null && goal > 0 && (
        <div className="mt-3 rounded-xl border border-line p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-xs text-sub">Guardado para a próxima troca</p>
            <p className="text-xs font-medium text-sub">
              {formatBRL(saved)} de {formatBRL(goal)}
            </p>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-ok" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Button
          onClick={() => (showPurchaseForm ? cancelPurchaseForm() : setShowPurchaseForm(true))}
          className="flex-1"
        >
          Registrar compra
        </Button>
        <Link to={`/itens/${item.id}/editar`} aria-label="Editar item" className={iconButton}>
          <PencilIcon className="h-4 w-4 text-sub" />
        </Link>
        <button
          onClick={archive}
          aria-label={item.status === 'active' ? 'Arquivar item' : 'Reativar item'}
          className={iconButton}
        >
          <ArchiveBoxIcon className="h-4 w-4 text-sub" />
        </button>
        <button
          onClick={remove}
          aria-label="Excluir item"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-erro-soft-line px-3 text-erro"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {item.status === 'archived' && (
        <p className="mt-2 text-center text-xs font-medium text-alerta">
          Item arquivado — fora do total mensal
        </p>
      )}

      {showPurchaseForm && (
        <form onSubmit={submitPurchase} className="mt-4 flex flex-col gap-3 rounded-xl border border-line p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-sub">
              Data
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-sub">
              Preço unitário (R$)
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-sub">
              Quantidade comprada
              <input
                type="number"
                min={1}
                value={purchaseQuantity}
                onChange={(e) => setPurchaseQuantity(e.target.value)}
                placeholder={item.quantity.toString()}
                className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
              />
            </label>
            <div className="flex flex-col justify-end pb-2">
              <p className="text-xs text-sub">Total desta compra</p>
              <p className="text-base font-semibold text-ink">
                {formatBRL(Number(price || 0) * Math.max(1, Number(purchaseQuantity) || item.quantity))}
              </p>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium text-sub">
            Observação
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="opcional — marca, loja, modelo…"
              className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="min-h-11 flex-1 rounded-lg bg-ink text-sm font-semibold text-paper">
              {editingPurchaseId ? 'Salvar alterações' : 'Salvar compra'}
            </button>
            <Button type="button" variant="secondary" onClick={cancelPurchaseForm} className="px-4 font-medium">
              Cancelar
            </Button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-sub">Histórico de compras</h2>
        {purchases.length === 0 && <p className="text-sm text-sub">Nenhuma compra registrada ainda.</p>}
        <ul className="flex flex-col gap-2">
          {[...purchases].reverse().map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block text-sub">{formatDate(p.date)}</span>
                {p.note && <span className="block truncate text-xs text-sub">{p.note}</span>}
              </span>
              <span className="text-right">
                <span className="block font-medium text-ink">
                  {formatBRL(p.unitPrice * p.quantity)}
                </span>
                {p.quantity > 1 && (
                  <span className="block text-xs text-sub">
                    {p.quantity} × {formatBRL(p.unitPrice)}
                  </span>
                )}
              </span>
              <button
                onClick={() => startEditPurchase(p)}
                aria-label={`Editar compra de ${formatDate(p.date)}`}
                className="flex min-h-11 min-w-11 items-center justify-center text-sub"
              >
                <PencilIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => removePurchase(p.id)}
                aria-label={`Excluir compra de ${formatDate(p.date)}`}
                className="flex min-h-11 min-w-11 items-center justify-center text-erro"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-sub">Aportes guardados</h2>
          <button
            onClick={() => setShowContributionForm((v) => !v)}
            className="min-h-11 text-xs font-medium text-accent-strong"
          >
            {showContributionForm ? 'Cancelar' : '+ Registrar aporte'}
          </button>
        </div>

        {showContributionForm && (
          <form onSubmit={submitContribution} className="mb-3 flex flex-col gap-3 rounded-xl border border-line p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium text-sub">
                Data
                <input
                  type="date"
                  value={contributionDate}
                  onChange={(e) => setContributionDate(e.target.value)}
                  className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium text-sub">
                Valor (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  className="rounded-lg border border-line-strong bg-surface px-3 py-2 text-base font-normal text-ink"
                />
              </label>
            </div>
            <button type="submit" className="min-h-11 rounded-lg bg-ink text-sm font-semibold text-paper">
              Salvar aporte
            </button>
          </form>
        )}

        {contributions.length === 0 && !showContributionForm && (
          <p className="text-sm text-sub">Nenhum aporte registrado neste ciclo.</p>
        )}
        <ul className="flex flex-col gap-2">
          {[...contributions].reverse().map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="text-sub">{formatDate(c.date)}</span>
              <span className="flex-1 text-right font-medium text-ink">{formatBRL(c.amount)}</span>
              <button
                onClick={() => removeContribution(c.id)}
                aria-label={`Excluir aporte de ${formatDate(c.date)}`}
                className="flex min-h-11 min-w-11 items-center justify-center text-erro"
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
