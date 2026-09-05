import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../hooks/useAppData'
import { db } from '../db/db'
import type { AppSettings, Category, Contribution, Item, Purchase } from '../domain/types'

const BACKUP_VERSION = 1

interface BackupFile {
  version: number
  exportedAt: string
  categories: Category[]
  items: Item[]
  purchases: Purchase[]
  contributions: Contribution[]
  settings: AppSettings
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function Settings() {
  const settings = useSettings()
  const [inflation, setInflation] = useState('4.5')
  const [reminderLeadDays, setReminderLeadDays] = useState(30)
  const [digestDay, setDigestDay] = useState(1)
  const [provisioningMethod, setProvisioningMethod] = useState<AppSettings['provisioningMethod']>('per-item')
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (settings) {
      setInflation((settings.annualInflationRate * 100).toString())
      setReminderLeadDays(settings.reminderLeadDays)
      setDigestDay(settings.monthlyDigestDayOfMonth)
      setProvisioningMethod(settings.provisioningMethod)
      // Only start debounced saving once real data has loaded, so the
      // effect below doesn't immediately overwrite it with local defaults.
      loadedRef.current = true
    }
  }, [settings])

  // Debounced save: validated on every change, persisted ~400ms after the
  // user stops typing (rather than on blur, which drops the last edit if
  // the user navigates away without leaving the field).
  useEffect(() => {
    if (!loadedRef.current) return
    const inflationValue = Number(inflation)
    if (!Number.isFinite(inflationValue)) return

    const timer = setTimeout(() => {
      db.settings.update('settings', {
        annualInflationRate: clamp(inflationValue, -50, 100) / 100,
        reminderLeadDays: clamp(Math.round(reminderLeadDays) || 1, 1, 365),
        monthlyDigestDayOfMonth: clamp(Math.round(digestDay) || 1, 1, 28),
        provisioningMethod,
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [inflation, reminderLeadDays, digestDay, provisioningMethod])

  async function exportBackup() {
    const [categories, items, purchases, contributions, settingsRow] = await Promise.all([
      db.categories.toArray(),
      db.items.toArray(),
      db.purchases.toArray(),
      db.contributions.toArray(),
      db.settings.get('settings'),
    ])
    const backup: BackupFile = {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      categories,
      items,
      purchases,
      contributions,
      settings: settingsRow ?? (settings as AppSettings),
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revez-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function triggerImport() {
    fileInputRef.current?.click()
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const text = await file.text()
      const backup = JSON.parse(text) as Partial<BackupFile>
      if (!Array.isArray(backup.items) || !Array.isArray(backup.purchases) || !Array.isArray(backup.categories)) {
        setImportStatus('Arquivo inválido: não parece um backup do Revez.')
        return
      }
      if (!confirm('Importar este backup vai substituir todos os dados atuais do app. Continuar?')) return

      await db.transaction('rw', db.categories, db.items, db.purchases, db.contributions, db.settings, async () => {
        await Promise.all([
          db.categories.clear(),
          db.items.clear(),
          db.purchases.clear(),
          db.contributions.clear(),
          db.settings.clear(),
        ])
        await db.categories.bulkPut(backup.categories!)
        await db.items.bulkPut(backup.items!)
        await db.purchases.bulkPut(backup.purchases!)
        if (Array.isArray(backup.contributions)) await db.contributions.bulkPut(backup.contributions)
        if (backup.settings) await db.settings.put(backup.settings)
      })
      setImportStatus('Backup importado com sucesso.')
    } catch {
      setImportStatus('Não foi possível ler o arquivo. Verifique se é um backup válido do Revez.')
    }
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
          className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
        <span className="text-xs text-slate-400">Usada para projetar preços com menos de 4 compras registradas.</span>
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        Avisar com quantos dias de antecedência
        <input
          type="number"
          min={1}
          max={365}
          value={reminderLeadDays}
          onChange={(e) => setReminderLeadDays(Number(e.target.value))}
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
          className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
      </label>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Método de provisão mensal</p>
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            <input
              type="radio"
              name="provisioningMethod"
              checked={provisioningMethod === 'per-item'}
              onChange={() => setProvisioningMethod('per-item')}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-slate-800 dark:text-slate-200">Por item (padrão)</span>
              <span className="block text-xs text-slate-500">
                Cada item financia exatamente o que falta no tempo que falta. Mais preciso, mas o total pode picar
                quando um item vence.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
            <input
              type="radio"
              name="provisioningMethod"
              checked={provisioningMethod === 'perpetual-average'}
              onChange={() => setProvisioningMethod('perpetual-average')}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-slate-800 dark:text-slate-200">Custo médio perpétuo</span>
              <span className="block text-xs text-slate-500">
                Divide pelo ciclo de vida completo. Número estável mês a mês, mas subfinancia itens comprados perto
                do fim da vida útil.
              </span>
            </span>
          </label>
        </div>
        <p className="text-xs text-slate-400">
          Detalhes em <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">docs/PROVISIONING-METHODS.md</code>.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 dark:border-slate-800">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Backup dos dados</p>
        <p className="text-xs text-slate-400">
          Os dados ficam só neste dispositivo. Exporte periodicamente para não perder tudo ao trocar de aparelho ou
          limpar o navegador.
        </p>
        <div className="flex gap-2">
          <button
            onClick={exportBackup}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Exportar backup
          </button>
          <button
            onClick={triggerImport}
            className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Importar backup
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={onImportFile} className="hidden" />
        {importStatus && <p className="text-xs text-slate-500">{importStatus}</p>}
      </div>
    </div>
  )
}
