import { useCategories, useItems, usePurchases, useSettings } from '../hooks/useAppData'
import { useMemo } from 'react'
import { historicalSpendByMonth, projectionByMonth, provisionByCategory } from '../domain/calculations'
import { formatBRL, formatMonthLabel } from '../domain/format'
import { useToday } from '../hooks/useToday'
import { CategoryIcon } from '../components/IconBadge'

export function DataPage() {
  return (
    <div className="px-4 pt-6">
      <h1 className="text-xl font-bold text-ink">Dados</h1>
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
  const today = useToday()

  const { byCategory, maxByCategory, spend, maxSpend } = useMemo(() => {
    const active = (items ?? []).filter((i) => i.status === 'active')
    const categoryTotals = provisionByCategory(active, purchases ?? [], settings, today)
    const monthlySpend = historicalSpendByMonth(purchases ?? [], today, 6)
    return {
      byCategory: categoryTotals,
      maxByCategory: Math.max(1, ...categoryTotals.map((c) => c.total)),
      spend: monthlySpend,
      maxSpend: Math.max(1, ...monthlySpend.map((m) => m.total)),
    }
  }, [items, purchases, settings, today])

  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-sub">Provisão mensal por categoria</h2>
        {byCategory.length === 0 && <p className="text-sm text-sub">Sem itens ativos para provisionar.</p>}
        <div className="flex flex-col gap-2">
          {byCategory.map((c) => {
            const category = categories?.find((cat) => cat.id === c.categoryId)
            return (
              <div key={c.categoryId} className="flex items-center gap-3">
                <div className="flex w-28 shrink-0 items-center gap-1.5 text-xs font-medium text-sub">
                  <CategoryIcon name={category?.icon ?? 'CubeIcon'} className="h-4 w-4" />
                  <span className="truncate">{category?.name ?? '—'}</span>
                </div>
                <div className="h-6 flex-1 overflow-hidden rounded bg-surface-2">
                  <div className="h-full rounded bg-accent" style={{ width: `${(c.total / maxByCategory) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-xs font-semibold text-ink">
                  {formatBRL(c.total)}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-sub">Gasto real nos últimos 6 meses</h2>
        <div className="flex flex-col gap-2">
          {spend.map((m) => (
            <div key={m.month} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-xs font-medium text-sub">{formatMonthLabel(m.month)}</span>
              <div className="h-6 flex-1 overflow-hidden rounded bg-surface-2">
                <div className="h-full rounded bg-accent" style={{ width: `${(m.total / maxSpend) * 100}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-semibold text-ink">
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
  const today = useToday()

  const { months, max } = useMemo(() => {
    const active = (items ?? []).filter((i) => i.status === 'active')
    const buckets = projectionByMonth(active, purchases ?? [], settings, today, 12)
    return { months: buckets, max: Math.max(1, ...buckets.map((m) => m.total)) }
  }, [items, purchases, settings, today])

  return (
    <section>
      <h2 className="text-sm font-semibold text-sub">Trocas previstas nos próximos 12 meses</h2>
      <p className="mt-1 text-xs text-sub">
        Custo de reposição por mês, pela data de troca projetada de cada item ativo.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {months.map((m) => (
          <div key={m.month} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-medium text-sub">{formatMonthLabel(m.month)}</span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-surface-2">
              <div className="h-full rounded bg-accent" style={{ width: `${(m.total / max) * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right text-xs font-semibold text-ink">
              {m.total > 0 ? formatBRL(m.total) : '—'}
            </span>
          </div>
        ))}
      </div>

      {months.every((m) => m.total === 0) && (
        <p className="mt-4 text-center text-sm text-sub">Nenhuma troca projetada nos próximos 12 meses.</p>
      )}
    </section>
  )
}
