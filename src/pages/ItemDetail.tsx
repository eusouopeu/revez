import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { useCategories, useItems, usePurchasesForItem, useSettings } from '../hooks/useAppData'
import { db } from '../db/db'
import { monthlyProvision, nextReplacementDate, projectedPrice } from '../domain/calculations'
import { formatBRL, formatDate, todayISO } from '../domain/format'
import { CategoryIcon } from '../components/IconBadge'
import { ArrowLeftIcon, PencilIcon, TrashIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline'

export function ItemDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const items = useItems()
  const categories = useCategories()
  const settings = useSettings()
  const purchases = usePurchasesForItem(id ?? '')
  const [showPurchaseForm, setShowPurchaseForm] = useState(false)
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(todayISO())

  const item = items?.find((i) => i.id === id)
  if (!item) return null

  const category = categories?.find((c) => c.id === item.categoryId)
  const today = new Date()
  const target = nextReplacementDate(item, purchases)
  const projected = projectedPrice(item, purchases, settings, today)
  const provision = monthlyProvision(item, purchases, settings, today)

  async function registerPurchase(e: React.FormEvent) {
    e.preventDefault()
    if (!price || !item) return
    await db.purchases.add({
      id: crypto.randomUUID(),
      itemId: item.id,
      date,
      unitPrice: Number(price),
      quantity: item.quantity,
    })
    setShowPurchaseForm(false)
    setPrice('')
    setDate(todayISO())
  }

  async function archive() {
    if (!item) return
    await db.items.update(item.id, { status: item.status === 'active' ? 'archived' : 'active' })
  }

  async function remove() {
    if (!item) return
    if (!confirm(`Excluir "${item.name}" e todo o histórico de compras?`)) return
    await db.purchases.where('itemId').equals(item.id).delete()
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
          <CategoryIcon name={category?.icon ?? 'CubeIcon'} className="h-6 w-6 text-violet-600 dark:text-violet-300" />
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

      <div className="mt-6 flex gap-2">
        <button
          onClick={() => setShowPurchaseForm((v) => !v)}
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
        <form onSubmit={registerPurchase} className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
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
          <button type="submit" className="rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            Salvar compra
          </button>
        </form>
      )}

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Histórico de compras</h2>
        {purchases.length === 0 && <p className="text-sm text-slate-400">Nenhuma compra registrada ainda.</p>}
        <ul className="flex flex-col gap-2">
          {[...purchases].reverse().map((p) => (
            <li key={p.id} className="flex justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">{formatDate(p.date)}</span>
              <span className="font-medium text-slate-900 dark:text-slate-50">{formatBRL(p.unitPrice)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
