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
import { Screen } from '../components/Screen'
import { Card, Empty, Field, IconButton, SectionTitle, inputClass } from '../components/ui'
import {
  ArchiveBoxArrowDownIcon,
  ArchiveBoxIcon,
  ArrowPathIcon,
  CalendarIcon,
  ClockIcon,
  PencilIcon,
  PlusIcon,
  ShoppingCartIcon,
  TagIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

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
      message: 'A data da próxima troca é recalculada.',
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
      message: 'Compras e aportes vão junto. Dá para desfazer logo depois.',
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

  const archived = item.status === 'archived'

  return (
    <Screen title={item.name} back>
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft">
            <CategoryIcon name={item.icon ?? category?.icon ?? 'CubeIcon'} className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="rotulo">Guardar por mês</p>
            <p className="text-[26px] font-extrabold leading-tight tracking-[-0.5px] text-ink">
              {provision != null ? formatBRL(provision) : '—'}
            </p>
          </div>
          {archived && (
            <span className="shrink-0 rounded-full bg-alerta-soft px-2 py-0.5 text-[11.5px] font-semibold text-alerta">
              Arquivado
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-sub">
          <span className="flex items-center gap-1" title="Próxima troca">
            <CalendarIcon className="h-4 w-4 text-faint" />
            {target ? formatDate(target) : 'sem data'}
          </span>
          <span className="flex items-center gap-1" title="Preço projetado">
            <TagIcon className="h-4 w-4 text-faint" />
            {projected != null ? formatBRL(projected) : '—'}
          </span>
          {item.quantity > 1 && <span>{item.quantity} un.</span>}
        </div>

        {goal != null && goal > 0 && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-ok transition-[width] duration-200" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-sub">
              {formatBRL(saved)} de {formatBRL(goal)}
            </p>
          </div>
        )}
      </Card>

      {settlement && (
        <div className="mt-3 rounded-xl bg-ok-soft p-4 text-ok">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[15px] font-bold">
              {settlement.leftover > 0
                ? `Sobrou ${formatBRL(settlement.leftover)}`
                : settlement.shortfall > 0
                  ? `Faltaram ${formatBRL(settlement.shortfall)}`
                  : 'Reserva cobriu a compra'}
            </p>
            {settlement.leftover <= 0 && (
              <IconButton label="Dispensar" onClick={() => setSettlement(null)} className="-mr-2 -mt-2 text-ok">
                <XMarkIcon className="h-5 w-5" />
              </IconButton>
            )}
          </div>
          <p className="text-[12.5px] opacity-80">
            Guardado {formatBRL(settlement.saved)} · pago {formatBRL(settlement.paid)}
          </p>
          {settlement.leftover > 0 && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={carryLeftover}
                className="min-h-11 flex-1 rounded-lg bg-ok px-3 text-[13.5px] font-semibold text-white"
              >
                Levar ao próximo ciclo
              </button>
              <button onClick={() => setSettlement(null)} className="min-h-11 px-3 text-[13.5px] font-semibold">
                Retirei
              </button>
            </div>
          )}
        </div>
      )}

      {!archived && (urgency === 'overdue' || urgency === 'due-soon') && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-alerta-soft p-2 pl-3.5 text-alerta">
          <ClockIcon className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-[13.5px] font-semibold">Adiar troca</span>
          {[1, 3, 6].map((m) => (
            <button
              key={m}
              onClick={() => postpone(m)}
              aria-label={`Adiar a troca em ${m} ${m === 1 ? 'mês' : 'meses'}`}
              className="min-h-10 min-w-12 rounded-lg bg-surface px-2 text-[13px] font-semibold"
            >
              +{m}m
            </button>
          ))}
        </div>
      )}

      {postponedMonths > 0 && (
        <p className="mt-2 flex items-center gap-1 text-[12.5px] text-sub">
          <ClockIcon className="h-4 w-4" /> Adiada +{postponedMonths} {postponedMonths === 1 ? 'mês' : 'meses'}
          <button onClick={undoPostpone} className="ml-1 min-h-10 font-semibold text-accent">
            Desfazer
          </button>
        </p>
      )}

      {suggestLifespan && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-alerta-soft p-2 pl-3.5 text-alerta">
          <ArrowPathIcon className="h-5 w-5 shrink-0" />
          <span className="flex-1 text-[13px]">
            Tem durado <strong>~{observedRounded} meses</strong>, não {item.lifespanMonths}
          </span>
          <button
            onClick={applyObservedLifespan}
            className="min-h-10 shrink-0 rounded-lg bg-surface px-3 text-[13px] font-semibold"
          >
            Ajustar
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center gap-1">
        <Button onClick={() => (showPurchaseForm ? cancelPurchaseForm() : setShowPurchaseForm(true))} className="flex-1">
          <ShoppingCartIcon className="h-5 w-5" /> Registrar compra
        </Button>
        <Link
          to={`/itens/${item.id}/editar`}
          aria-label="Editar item"
          title="Editar item"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-sub"
        >
          <PencilIcon className="h-5 w-5" />
        </Link>
        <IconButton label={archived ? 'Reativar item' : 'Arquivar item'} onClick={archive} className="h-11 w-11">
          {archived ? <ArchiveBoxArrowDownIcon className="h-5 w-5" /> : <ArchiveBoxIcon className="h-5 w-5" />}
        </IconButton>
        <IconButton label="Excluir item" onClick={remove} className="h-11 w-11 text-erro">
          <TrashIcon className="h-5 w-5" />
        </IconButton>
      </div>

      {showPurchaseForm && (
        <Card className="mt-3">
          <form onSubmit={submitPurchase} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Preço unit. (R$)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Quantidade">
                <input
                  type="number"
                  min={1}
                  value={purchaseQuantity}
                  onChange={(e) => setPurchaseQuantity(e.target.value)}
                  placeholder={item.quantity.toString()}
                  className={inputClass}
                />
              </Field>
              <div className="flex flex-col justify-end gap-1.5">
                <span className="rotulo">Total</span>
                <p className="py-2.5 text-[15px] font-semibold text-ink">
                  {formatBRL(Number(price || 0) * Math.max(1, Number(purchaseQuantity) || item.quantity))}
                </p>
              </div>
            </div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Observação (marca, loja…)"
              aria-label="Observação"
              className={inputClass}
            />
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {editingPurchaseId ? 'Salvar alterações' : 'Salvar compra'}
              </Button>
              <Button type="button" variant="ghost" onClick={cancelPurchaseForm}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <section className="mt-6">
        <SectionTitle>Compras</SectionTitle>
        {purchases.length === 0 && <Empty>Nenhuma compra registrada.</Empty>}
        <ul className="flex flex-col gap-1.5">
          {[...purchases].reverse().map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-lg bg-surface py-1 pl-3.5 pr-1">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink">{formatBRL(p.unitPrice * p.quantity)}</span>
                <span className="block truncate text-[12px] text-sub">
                  {formatDate(p.date)}
                  {p.quantity > 1 && ` · ${p.quantity} × ${formatBRL(p.unitPrice)}`}
                  {p.note && ` · ${p.note}`}
                </span>
              </span>
              <IconButton label={`Editar compra de ${formatDate(p.date)}`} onClick={() => startEditPurchase(p)}>
                <PencilIcon className="h-4 w-4" />
              </IconButton>
              <IconButton label={`Excluir compra de ${formatDate(p.date)}`} onClick={() => removePurchase(p.id)} className="text-erro">
                <TrashIcon className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <SectionTitle
          action={
            <IconButton
              label={showContributionForm ? 'Cancelar aporte' : 'Registrar aporte'}
              onClick={() => setShowContributionForm((v) => !v)}
              className="text-accent"
            >
              {showContributionForm ? <XMarkIcon className="h-5 w-5" /> : <PlusIcon className="h-5 w-5" />}
            </IconButton>
          }
        >
          Aportes
        </SectionTitle>

        {showContributionForm && (
          <Card className="mb-2">
            <form onSubmit={submitContribution} className="flex items-end gap-2">
              <Field label="Data" className="flex-1">
                <input
                  type="date"
                  value={contributionDate}
                  onChange={(e) => setContributionDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Valor (R$)" className="flex-1">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Button type="submit">Salvar</Button>
            </form>
          </Card>
        )}

        {contributions.length === 0 && !showContributionForm && <Empty>Nenhum aporte neste ciclo.</Empty>}
        <ul className="flex flex-col gap-1.5">
          {[...contributions].reverse().map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg bg-surface py-1 pl-3.5 pr-1">
              <span className="flex-1 text-[13px] text-sub">{formatDate(c.date)}</span>
              <span className="text-[14px] font-medium text-ink">{formatBRL(c.amount)}</span>
              <IconButton label={`Excluir aporte de ${formatDate(c.date)}`} onClick={() => removeContribution(c.id)} className="text-erro">
                <TrashIcon className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </section>

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
    </Screen>
  )
}
