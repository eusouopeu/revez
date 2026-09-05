import { useNavigate } from 'react-router-dom'
import { useItems, usePurchases, useSettings } from '../hooks/useAppData'
import { projectionByMonth } from '../domain/calculations'
import { formatBRL, formatMonthLabel } from '../domain/format'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'

export function Projection() {
  const navigate = useNavigate()
  const items = useItems()
  const purchases = usePurchases()
  const settings = useSettings()
  const today = new Date()

  const activeItems = (items ?? []).filter((i) => i.status === 'active')
  const months = projectionByMonth(activeItems, purchases ?? [], settings, today, 12)
  const max = Math.max(1, ...months.map((m) => m.total))

  return (
    <div className="px-4 pt-6">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-sm text-slate-500">
        <ArrowLeftIcon className="h-4 w-4" /> Voltar
      </button>

      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Projeção de 12 meses</h1>
      <p className="mt-1 text-sm text-slate-500">
        Custo previsto de reposição por mês, pela data de troca projetada de cada item ativo.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {months.map((m) => (
          <div key={m.month} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs font-medium text-slate-500">
              {formatMonthLabel(m.month)}
            </span>
            <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded bg-violet-500"
                style={{ width: `${(m.total / max) * 100}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs font-semibold text-slate-700 dark:text-slate-200">
              {m.total > 0 ? formatBRL(m.total) : '—'}
            </span>
          </div>
        ))}
      </div>

      {months.every((m) => m.total === 0) && (
        <p className="mt-6 text-center text-sm text-slate-400">
          Nenhuma troca projetada nos próximos 12 meses.
        </p>
      )}
    </div>
  )
}
