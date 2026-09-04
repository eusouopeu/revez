import { Link } from 'react-router-dom'
import { useCategories, useItems, usePurchases, useSettings } from '../hooks/useAppData'
import { monthlyProvision, nextReplacementDate, totalMonthly, urgencyOf, type ItemUrgency } from '../domain/calculations'
import { formatBRL, formatDate } from '../domain/format'
import { CategoryIcon } from '../components/IconBadge'
import { ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/24/solid'

const urgencyStyle: Record<ItemUrgency, string> = {
  overdue: 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950',
  'due-soon': 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
  ok: 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
  unscheduled: 'border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900',
}

const urgencyRank: Record<ItemUrgency, number> = { overdue: 0, 'due-soon': 1, unscheduled: 2, ok: 3 }

export function Dashboard() {
  const items = useItems()
  const purchases = usePurchases()
  const categories = useCategories()
  const settings = useSettings()
  const today = new Date()

  const activeItems = (items ?? []).filter((i) => i.status === 'active')
  const total = totalMonthly(activeItems, purchases ?? [], settings, today)

  const sorted = [...activeItems].sort((a, b) => {
    const ua = urgencyOf(a, purchases ?? [], today, settings.reminderLeadDays)
    const ub = urgencyOf(b, purchases ?? [], today, settings.reminderLeadDays)
    return urgencyRank[ua] - urgencyRank[ub]
  })

  return (
    <div className="px-4 pt-6">
      <h1 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Guardar por mês</h1>
      <p className="mt-1 text-4xl font-extrabold text-slate-900 dark:text-slate-50">{formatBRL(total)}</p>
      <p className="mt-1 text-sm text-slate-500">
        Soma da provisão de {activeItems.length} {activeItems.length === 1 ? 'item ativo' : 'itens ativos'}
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {sorted.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
            Nenhum item cadastrado ainda. Toque em “Novo item” para começar.
          </div>
        )}
        {sorted.map((item) => {
          const category = categories?.find((c) => c.id === item.categoryId)
          const urgency = urgencyOf(item, purchases ?? [], today, settings.reminderLeadDays)
          const target = nextReplacementDate(item, purchases ?? [])
          const provision = monthlyProvision(item, purchases ?? [], settings, today)

          return (
            <Link
              key={item.id}
              to={`/itens/${item.id}`}
              className={`flex items-center gap-3 rounded-xl border p-3 ${urgencyStyle[urgency]}`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900">
                <CategoryIcon name={category?.icon ?? 'CubeIcon'} className="h-5 w-5 text-violet-600 dark:text-violet-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{item.name}</p>
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  {urgency === 'overdue' && <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-500" />}
                  {urgency === 'due-soon' && <ClockIcon className="h-3.5 w-3.5 text-amber-500" />}
                  {target ? `Trocar em ${formatDate(target)}` : 'Data de compra não informada'}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {provision != null ? formatBRL(provision) : '—'}
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
