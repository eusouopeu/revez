import { useState } from 'react'
import { useCategories, useItems, usePurchases, useSettings } from '../hooks/useAppData'
import {
  historicalSpendByMonth,
  projectionByMonth,
  provisionByCategory,
  urgencyOf,
  nextReplacementDate,
  monthlyProvision,
  type ItemUrgency,
} from '../domain/calculations'
import { formatBRL, formatDate, formatMonthLabel } from '../domain/format'
import { CategoryIcon } from '../components/IconBadge'

type Tab = 'graficos' | 'projecoes'

const urgencyLabel: Record<ItemUrgency, string> = {
  overdue: 'Atrasado',
  'due-soon': 'Em breve',
  ok: 'Em dia',
  unscheduled: 'Sem data',
}

export function DataPage() {
  const [tab, setTab] = useState<Tab>('graficos')

  return (
    <div className="px-4 pt-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Dados</h1>

      <div className="mt-4 inline-flex rounded-full bg-slate-100 p-1 dark:bg-slate-900">
        {(
          [
            ['graficos', 'Gráficos e tabelas'],
            ['projecoes', 'Projeções'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === value
                ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-700 dark:text-violet-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">{tab === 'graficos' ? <ChartsView /> : <ProjectionsView />}</div>
    </div>
  )
}

function ChartsView() {
  const items = useItems()
  const purchases = usePurchases()
  const categories = useCategories()
  const settings = useSettings()
  const today = new Date()

  const activeItems = (items ?? []).filter((i) => i.status === 'active')
  const byCategory = provisionByCategory(activeItems, purchases ?? [], settings, today)
  const maxByCategory = Math.max(1, ...byCategory.map((c) => c.total))

  const spend = historicalSpendByMonth(purchases ?? [], today, 6)
  const maxSpend = Math.max(1, ...spend.map((m) => m.total))

  const table = [...activeItems]
    .map((item) => ({
      item,
      urgency: urgencyOf(item, purchases ?? [], today, settings.reminderLeadDays),
      target: nextReplacementDate(item, purchases ?? []),
      provision: monthlyProvision(item, purchases ?? [], settings, today),
    }))
    .sort((a, b) => (b.provision ?? 0) - (a.provision ?? 0))

  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Provisão mensal por categoria</h2>
        {byCategory.length === 0 && <p className="text-sm text-slate-400">Sem itens ativos para provisionar.</p>}
        <div className="flex flex-col gap-2">
          {byCategory.map((c) => {
            const category = categories?.find((cat) => cat.id === c.categoryId)
            return (
              <div key={c.categoryId} className="flex items-center gap-3">
                <div className="flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium text-slate-500">
                  <CategoryIcon name={category?.icon ?? 'CubeIcon'} className="h-4 w-4" />
                  <span className="truncate">{category?.name ?? '—'}</span>
                </div>
                <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded bg-violet-500" style={{ width: `${(c.total / maxByCategory) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {formatBRL(c.total)}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Gasto real nos últimos 6 meses</h2>
        <div className="flex flex-col gap-2">
          {spend.map((m) => (
            <div key={m.month} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-xs font-medium text-slate-500">{formatMonthLabel(m.month)}</span>
              <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded bg-sky-500" style={{ width: `${(m.total / maxSpend) * 100}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
                {m.total > 0 ? formatBRL(m.total) : '—'}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Itens ativos</h2>
        {table.length === 0 && <p className="text-sm text-slate-400">Nenhum item ativo.</p>}
        {table.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Troca</th>
                  <th className="px-3 py-2 text-right font-medium">Guardar/mês</th>
                </tr>
              </thead>
              <tbody>
                {table.map(({ item, urgency, target, provision }) => (
                  <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="max-w-[9rem] truncate px-3 py-2 font-medium text-slate-800 dark:text-slate-100">
                      {item.name}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{urgencyLabel[urgency]}</td>
                    <td className="px-3 py-2 text-slate-500">{target ? formatDate(target) : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">
                      {provision != null ? formatBRL(provision) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function ProjectionsView() {
  const items = useItems()
  const purchases = usePurchases()
  const settings = useSettings()
  const today = new Date()

  const activeItems = (items ?? []).filter((i) => i.status === 'active')
  const months = projectionByMonth(activeItems, purchases ?? [], settings, today, 12)
  const max = Math.max(1, ...months.map((m) => m.total))

  return (
    <div>
      <p className="text-sm text-slate-500">
        Custo previsto de reposição por mês, pela data de troca projetada de cada item ativo.
      </p>

      <div className="mt-5 flex flex-col gap-2">
        {months.map((m) => (
          <div key={m.month} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-medium text-slate-500">{formatMonthLabel(m.month)}</span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded bg-violet-500" style={{ width: `${(m.total / max) * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
              {m.total > 0 ? formatBRL(m.total) : '—'}
            </span>
          </div>
        ))}
      </div>

      {months.every((m) => m.total === 0) && (
        <p className="mt-6 text-center text-sm text-slate-400">Nenhuma troca projetada nos próximos 12 meses.</p>
      )}
    </div>
  )
}
