import { useCategories, useItems, usePurchases, useSettings } from '../hooks/useAppData'
import { historicalSpendByMonth, projectionByMonth, provisionByCategory } from '../domain/calculations'
import { formatBRL, formatMonthLabel } from '../domain/format'
import { CategoryIcon } from '../components/IconBadge'

export function DataPage() {
  return (
    <div className="px-4 pt-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Dados</h1>
      <div className="mt-5">
        <ChartsView />
      </div>
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

      <ProjectionsView />
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
    <section>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Trocas previstas nos próximos 12 meses</h2>
      <p className="mt-1 text-xs text-slate-500">
        Custo de reposição por mês, pela data de troca projetada de cada item ativo.
      </p>

      <div className="mt-3 flex flex-col gap-2">
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
        <p className="mt-4 text-center text-sm text-slate-400">Nenhuma troca projetada nos próximos 12 meses.</p>
      )}
    </section>
  )
}
