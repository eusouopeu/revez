import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useAppData'
import { db } from '../db/db'

export function Settings() {
  const settings = useSettings()
  const [inflation, setInflation] = useState('4.5')
  const [reminderLeadDays, setReminderLeadDays] = useState(30)
  const [digestDay, setDigestDay] = useState(1)

  useEffect(() => {
    if (settings) {
      setInflation((settings.annualInflationRate * 100).toString())
      setReminderLeadDays(settings.reminderLeadDays)
      setDigestDay(settings.monthlyDigestDayOfMonth)
    }
  }, [settings])

  async function save() {
    await db.settings.update('settings', {
      annualInflationRate: Number(inflation) / 100,
      reminderLeadDays,
      monthlyDigestDayOfMonth: digestDay,
    })
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Ajustes</h1>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        Correção anual estimada (inflação, %)
        <input
          type="number"
          step="0.1"
          value={inflation}
          onChange={(e) => setInflation(e.target.value)}
          onBlur={save}
          className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
        <span className="text-xs text-slate-400">Usada para projetar preços com menos de 4 compras registradas.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        Avisar com quantos dias de antecedência
        <input
          type="number"
          min={1}
          value={reminderLeadDays}
          onChange={(e) => setReminderLeadDays(Number(e.target.value))}
          onBlur={save}
          className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        Dia do mês para o resumo de poupança
        <input
          type="number"
          min={1}
          max={28}
          value={digestDay}
          onChange={(e) => setDigestDay(Number(e.target.value))}
          onBlur={save}
          className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
      </label>

      <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-800">
        Método de provisão: <strong className="text-slate-700 dark:text-slate-300">por item</strong>. A
        alternativa (custo médio perpétuo) está documentada em{' '}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">docs/PROVISIONING-METHODS.md</code>.
      </div>
    </div>
  )
}
