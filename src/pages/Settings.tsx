import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCategories, useSettings } from '../hooks/useAppData'
import { db, deleteDemoData, hasDemoData } from '../db/db'
import {
  applyBackup,
  BackupError,
  buildBackup,
  daysSinceBackup,
  parseBackup,
  totalSkipped,
  type BackupFile,
  type BackupSummary,
  type ImportMode,
} from '../db/backup'
import {
  notificationPermission,
  notificationsSupported,
  pendingNotifications,
  requestNotificationPermission,
  sendTestNotification,
  type NotificationPermission,
  type PendingNotification,
} from '../notifications/scheduler'
import { formatDate } from '../domain/format'
import { useToday } from '../hooks/useToday'
import { CategoryIcon } from '../components/IconBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { AppSettings, Category } from '../domain/types'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const EXPORT_REMINDER_DAYS = 30

/** Formatted export date, or empty when the file carries no readable timestamp. */
function exportedAtLabel(exportedAt: string | undefined): string {
  if (!exportedAt) return ''
  const date = new Date(exportedAt)
  return Number.isFinite(date.getTime()) ? formatDate(date) : ''
}

export function Settings() {
  const settings = useSettings()
  const [inflation, setInflation] = useState('4.5')
  const [reminderLeadDays, setReminderLeadDays] = useState(30)
  const [digestDay, setDigestDay] = useState(1)
  const [provisioningMethod, setProvisioningMethod] = useState<AppSettings['provisioningMethod']>('per-item')
  const demoPresent = useLiveQuery(hasDemoData, [], false)
  const [confirmDemo, setConfirmDemo] = useState(false)
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

  return (
    <div className="flex flex-col gap-5 px-4 pt-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Ajustes</h1>

      <CategoriesSection />

      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        Correção anual estimada (inflação, %)
        <input
          type="number"
          step="0.1"
          value={inflation}
          onChange={(e) => setInflation(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-base font-normal dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
        <span className="text-xs text-slate-600 dark:text-slate-400">
          Usada para projetar preços com menos de 4 compras registradas.
        </span>
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

      <NotificationsSection />

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
              <span className="block text-xs text-slate-600 dark:text-slate-400">
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
              <span className="block text-xs text-slate-600 dark:text-slate-400">
                Divide pelo ciclo de vida completo. Número estável mês a mês, mas subfinancia itens comprados perto
                do fim da vida útil.
              </span>
            </span>
          </label>
        </div>
      </div>

      <BackupSection />

      {demoPresent && (
        <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Dados de exemplo</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            O app veio com itens, compras e aportes fictícios para demonstração. Seus próprios registros não são
            afetados.
          </p>
          <button
            onClick={() => setConfirmDemo(true)}
            className="min-h-11 rounded-lg border border-red-300 text-sm font-semibold text-red-600 dark:border-red-900 dark:text-red-400"
          >
            Apagar dados de exemplo
          </button>
          <ConfirmDialog
            open={confirmDemo}
            title="Apagar todos os dados de exemplo?"
            message="Os itens, compras e aportes fictícios saem do app. Seus registros não são tocados."
            confirmLabel="Apagar"
            destructive
            onConfirm={async () => {
              setConfirmDemo(false)
              await deleteDemoData()
            }}
            onCancel={() => setConfirmDemo(false)}
          />
        </div>
      )}
    </div>
  )
}

const permissionLabel: Record<NotificationPermission, string> = {
  granted: 'Avisos autorizados',
  denied: 'Avisos bloqueados no sistema',
  prompt: 'Permissão ainda não concedida',
  unsupported: 'Disponível apenas no app instalado',
}

function NotificationsSection() {
  const [permission, setPermission] = useState<NotificationPermission>('unsupported')
  const [pending, setPending] = useState<PendingNotification[]>([])
  const [status, setStatus] = useState<string | null>(null)

  async function refresh() {
    setPermission(await notificationPermission())
    setPending(await pendingNotifications())
  }

  useEffect(() => {
    refresh()
  }, [])

  const supported = notificationsSupported()

  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 dark:border-slate-800">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Notificações</p>
      <p
        className={`text-xs font-medium ${
          permission === 'granted'
            ? 'text-emerald-700 dark:text-emerald-400'
            : permission === 'denied'
              ? 'text-red-600 dark:text-red-400'
              : 'text-amber-700 dark:text-amber-400'
        }`}
      >
        {permissionLabel[permission]}
      </p>

      {!supported && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          No navegador o app não agenda avisos. Instale o APK para receber os lembretes de troca e o resumo mensal.
        </p>
      )}

      {supported && permission !== 'granted' && (
        <>
          {permission === 'denied' && (
            <p className="text-xs text-slate-600 dark:text-slate-400">
              A permissão foi negada. Libere em Ajustes do Android &gt; Apps &gt; Revez &gt; Notificações.
            </p>
          )}
          <button
            onClick={async () => {
              setPermission(await requestNotificationPermission())
              await refresh()
            }}
            className="min-h-11 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Permitir notificações
          </button>
        </>
      )}

      {supported && permission === 'granted' && (
        <button
          onClick={async () => {
            const sent = await sendTestNotification()
            setStatus(sent ? 'Teste enviado: o aviso chega em alguns segundos.' : 'Não foi possível enviar o teste.')
            await refresh()
          }}
          className="min-h-11 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          Enviar notificação de teste
        </button>
      )}
      {status && <p className="text-xs text-slate-600 dark:text-slate-400">{status}</p>}

      {pending.length > 0 && (
        <details className="text-xs text-slate-600 dark:text-slate-400">
          <summary className="min-h-11 cursor-pointer py-3 font-medium">
            Próximos avisos agendados ({pending.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {pending.slice(0, 10).map((n) => (
              <li key={n.id} className="flex justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
                <span className="shrink-0">{n.at ? formatDate(n.at) : 'mensal'}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

interface PendingImport {
  backup: BackupFile
  summary: BackupSummary
}

function BackupSection() {
  const settings = useSettings()
  const today = useToday()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sinceBackup = daysSinceBackup(settings?.lastBackupAt, today)

  async function exportBackup() {
    const backup = await buildBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revez-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    await db.settings.update('settings', { lastBackupAt: new Date().toISOString() })
    setStatus('Backup exportado.')
    setError(null)
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStatus(null)
    try {
      setPendingImport(parseBackup(await file.text()))
      setError(null)
    } catch (err) {
      setPendingImport(null)
      setError(err instanceof BackupError ? err.message : 'Não foi possível ler o arquivo.')
    }
  }

  async function runImport(mode: ImportMode) {
    if (!pendingImport) return
    await applyBackup(pendingImport.backup, mode)
    const skipped = totalSkipped(pendingImport.summary)
    setPendingImport(null)
    setStatus(
      `Backup ${mode === 'replace' ? 'restaurado' : 'mesclado'} com sucesso.` +
        (skipped > 0 ? ` ${skipped} ${skipped === 1 ? 'registro inválido foi ignorado' : 'registros inválidos foram ignorados'}.` : ''),
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t border-slate-200 pt-5 dark:border-slate-800">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Backup dos dados</p>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Os dados ficam só neste dispositivo. Exporte periodicamente para não perder tudo ao trocar de aparelho ou
        limpar o navegador.
      </p>
      {sinceBackup == null ? (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Você ainda não exportou nenhum backup.</p>
      ) : (
        sinceBackup >= EXPORT_REMINDER_DAYS && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Último backup há {sinceBackup} dias. Vale exportar de novo.
          </p>
        )
      )}
      <div className="flex gap-2">
        <button
          onClick={exportBackup}
          className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          Exportar backup
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
        >
          Importar backup
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="application/json" onChange={onImportFile} className="hidden" />

      {pendingImport && (
        <div className="mt-1 flex flex-col gap-2 rounded-xl border border-slate-300 p-3 dark:border-slate-700">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Conferir antes de importar</p>
          <ul className="text-xs text-slate-600 dark:text-slate-400">
            <li>
              Formato {pendingImport.summary.version}
              {exportedAtLabel(pendingImport.summary.exportedAt) && `, exportado em ${exportedAtLabel(pendingImport.summary.exportedAt)}`}
            </li>
            <li>
              {pendingImport.summary.items} itens, {pendingImport.summary.purchases} compras,{' '}
              {pendingImport.summary.contributions} aportes, {pendingImport.summary.categories} categorias
            </li>
            {totalSkipped(pendingImport.summary) > 0 && (
              <li className="font-medium text-amber-700 dark:text-amber-400">
                {totalSkipped(pendingImport.summary)} registro(s) inválido(s) serão ignorados
              </li>
            )}
          </ul>
          <button
            onClick={() => runImport('merge')}
            className="min-h-11 rounded-lg bg-violet-600 text-sm font-semibold text-white"
          >
            Mesclar com os dados atuais
          </button>
          <button
            onClick={() => runImport('replace')}
            className="min-h-11 rounded-lg border border-red-300 text-sm font-semibold text-red-600 dark:border-red-900 dark:text-red-400"
          >
            Substituir tudo o que está no app
          </button>
          <button
            onClick={() => setPendingImport(null)}
            className="min-h-11 text-sm font-medium text-slate-600 dark:text-slate-400"
          >
            Cancelar
          </button>
        </div>
      )}

      {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      {status && <p className="text-xs text-slate-600 dark:text-slate-400">{status}</p>}
    </div>
  )
}

function CategoriesSection() {
  const categories = useCategories()
  const items = useLiveQuery(() => db.items.toArray(), [], [])
  const [newName, setNewName] = useState('')

  async function rename(category: Category, name: string) {
    const trimmed = name.trim()
    if (trimmed && trimmed !== category.name) await db.categories.update(category.id, { name: trimmed })
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    await db.categories.add({ id: crypto.randomUUID(), name, icon: 'TagIcon', defaultLifespanMonths: 12 })
    setNewName('')
  }

  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 pb-5 dark:border-slate-800">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Categorias</p>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Toque no nome para renomear. Categorias ocultas somem do cadastro e dos filtros; os itens delas continuam.
      </p>
      <ul className="flex flex-col gap-2">
        {categories?.map((category) => {
          const count = items?.filter((i) => i.categoryId === category.id).length ?? 0
          return (
            <li
              key={category.id}
              className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 dark:border-slate-800 ${category.hidden ? 'opacity-60' : ''}`}
            >
              <CategoryIcon name={category.icon} className="h-4 w-4 shrink-0 text-violet-500" />
              <input
                defaultValue={category.name}
                key={category.name}
                aria-label={`Nome da categoria ${category.name}`}
                onBlur={(e) => rename(category, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-slate-800 dark:text-slate-100"
              />
              <span className="shrink-0 text-xs text-slate-500">{count}</span>
              <button
                onClick={() => db.categories.update(category.id, { hidden: !category.hidden })}
                className="min-h-11 shrink-0 rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-300"
              >
                {category.hidden ? 'Mostrar' : 'Ocultar'}
              </button>
            </li>
          )
        })}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nova categoria"
          aria-label="Nome da nova categoria"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
        />
        <button type="submit" className="min-h-11 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white">
          Adicionar
        </button>
      </form>
    </div>
  )
}
