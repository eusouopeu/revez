import { useCategories, useItems, usePurchases, useSettings } from '../hooks/useAppData'
import { useMemo } from 'react'
import { historicalSpendByMonth, projectionByMonth, provisionByCategory } from '../domain/calculations'
import { formatBRL, formatMonthLabel } from '../domain/format'
import { useToday } from '../hooks/useToday'
import { CategoryIcon } from '../components/IconBadge'
import { Screen } from '../components/Screen'
import { Card, Empty, SectionTitle } from '../components/ui'
import type { ReactNode } from 'react'

export function DataPage() {
  return (
    <Screen title="Dados">
      <ChartsView />
    </Screen>
  )
}

function BarRow({ label, value, max }: { label: ReactNode; value: number; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-24 shrink-0 items-center gap-1.5 truncate text-[12.5px] font-medium text-sub">{label}</div>
      <div className="h-5 flex-1 overflow-hidden rounded bg-surface-2">
        <div className="h-full rounded bg-accent-fill" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-[12.5px] font-semibold text-ink">
        {value > 0 ? formatBRL(value) : '—'}
      </span>
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
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle>Provisão por categoria</SectionTitle>
        <Card className="flex flex-col gap-2">
          {byCategory.length === 0 && <Empty>Sem itens ativos.</Empty>}
          {byCategory.map((c) => {
            const category = categories?.find((cat) => cat.id === c.categoryId)
            return (
              <BarRow
                key={c.categoryId}
                label={
                  <>
                    <CategoryIcon name={category?.icon ?? 'CubeIcon'} className="h-4 w-4 shrink-0" />
                    <span className="truncate">{category?.name ?? '—'}</span>
                  </>
                }
                value={c.total}
                max={maxByCategory}
              />
            )
          })}
        </Card>
      </section>

      <section>
        <SectionTitle>Gasto real · 6 meses</SectionTitle>
        <Card className="flex flex-col gap-2">
          {spend.map((m) => (
            <BarRow key={m.month} label={formatMonthLabel(m.month)} value={m.total} max={maxSpend} />
          ))}
        </Card>
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
      <SectionTitle help="Custo de reposição por mês, pela data de troca projetada de cada item ativo.">
        Trocas previstas · 12 meses
      </SectionTitle>
      <Card className="flex flex-col gap-2">
        {months.every((m) => m.total === 0) ? (
          <Empty>Nenhuma troca prevista.</Empty>
        ) : (
          months.map((m) => <BarRow key={m.month} label={formatMonthLabel(m.month)} value={m.total} max={max} />)
        )}
      </Card>
    </section>
  )
}
