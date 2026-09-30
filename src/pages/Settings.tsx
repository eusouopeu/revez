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
import { Button } from '../components/Button'
import { Screen } from '../components/Screen'
import { Card, Field, IconButton, SectionTitle, inputClass } from '../components/ui'
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  BellAlertIcon,
  BellIcon,
  BellSlashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  EyeSlashIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
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

const methods: { id: AppSettings['provisioningMethod']; label: string }[] = [
  { id: 'per-item', label: 'Por item' },
  { id: 'perpetual-average', label: 'Custo médio' },
]

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
    <Screen title="Ajustes">
      <div className="flex flex-col gap-6">
        <CategoriesSection />

        <section>
          <SectionTitle
            help={
              <>
                A inflação projeta o preço de itens com menos de 4 compras registradas. <strong>Por item</strong>{' '}
                financia exatamente o que falta no tempo que falta — mais preciso, mas o total sobe quando um item
                vence. <strong>Custo médio</strong> divide pelo ciclo completo — estável, mas subfinancia itens
                comprados perto do fim da vida útil.
              </>
            }
          >
            Cálculo
          </SectionTitle>
          <Card className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="rotulo">Provisão mensal</span>
              <div className="flex gap-1 rounded-lg bg-surface-2 p-1" role="tablist" aria-label="Método de provisão">
                {methods.map((m) => {
                  const active = provisioningMethod === m.id
                  return (
                    <button
                      key={m.id}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setProvisioningMethod(m.id)}
                      className={`min-h-10 flex-1 rounded-md text-[13.5px] font-semibold ${
                        active ? 'bg-surface text-accent' : 'text-sub'
                      }`}
                    >
                      {m.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Inflação %">
                <input
                  type="number"
                  step="0.1"
                  value={inflation}
                  onChange={(e) => setInflation(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Aviso (dias)">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={reminderLeadDays}
                  onChange={(e) => setReminderLeadDays(Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
              <Field label="Resumo (dia)">
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={digestDay}
                  onChange={(e) => setDigestDay(Number(e.target.value))}
                  className={inputClass}
                />
              </Field>
            </div>
          </Card>
        </section>

        <NotificationsSection />

        <BackupSection />

        {demoPresent && (
          <section>
            <SectionTitle help="O app veio com itens, compras e aportes fictícios. Apagá-los não afeta seus próprios registros.">
              Dados de exemplo
            </SectionTitle>
            <Button variant="secondary" onClick={() => setConfirmDemo(true)} className="w-full text-erro">
              <TrashIcon className="h-5 w-5" /> Apagar dados de exemplo
            </Button>
            <ConfirmDialog
              open={confirmDemo}
              title="Apagar os dados de exemplo?"
              message="Seus próprios registros não são tocados."
              confirmLabel="Apagar"
              destructive
              onConfirm={async () => {
                setConfirmDemo(false)
                await deleteDemoData()
              }}
              onCancel={() => setConfirmDemo(false)}
            />
          </section>
        )}
      </div>
    </Screen>
  )
}

const permissionView: Record<NotificationPermission, { label: string; tone: string; Icon: typeof BellIcon }> = {
  granted: { label: 'Autorizadas', tone: 'text-ok', Icon: BellAlertIcon },
  denied: { label: 'Bloqueadas no sistema', tone: 'text-erro', Icon: BellSlashIcon },
  prompt: { label: 'Não autorizadas', tone: 'text-alerta', Icon: BellIcon },
  unsupported: { label: 'Só no app instalado', tone: 'text-sub', Icon: BellSlashIcon },
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
  const view = permissionView[permission]

  return (
    <section>
      <SectionTitle
        help={
          !supported
            ? 'No navegador o app não agenda avisos. Instale o APK para receber lembretes de troca e o resumo mensal.'
            : permission === 'denied'
              ? 'Libere em Ajustes do Android > Apps > Revez > Notificações.'
              : undefined
        }
      >
        Notificações
      </SectionTitle>
      <Card className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <view.Icon className={`h-5 w-5 ${view.tone}`} />
          <span className={`flex-1 text-[14px] font-medium ${view.tone}`}>{view.label}</span>
          {supported && permission !== 'granted' && (
            <Button
              variant="secondary"
              onClick={async () => {
                setPermission(await requestNotificationPermission())
                await refresh()
              }}
            >
              Permitir
            </Button>
          )}
          {supported && permission === 'granted' && (
            <Button
              variant="secondary"
              onClick={async () => {
                const sent = await sendTestNotification()
                setStatus(sent ? 'Teste enviado' : 'Falha ao enviar o teste')
                await refresh()
              }}
            >
              Testar
            </Button>
          )}
        </div>
        {status && <p className="text-[12.5px] text-sub">{status}</p>}

        {pending.length > 0 && (
          <details className="text-[12.5px] text-sub">
            <summary className="flex min-h-10 cursor-pointer items-center font-medium">
              Próximos avisos ({pending.length})
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
      </Card>
    </section>
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
    setStatus('Backup exportado')
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
      `Backup ${mode === 'replace' ? 'restaurado' : 'mesclado'}` +
        (skipped > 0 ? ` · ${skipped} ${skipped === 1 ? 'registro inválido ignorado' : 'registros inválidos ignorados'}` : ''),
    )
  }

  const stale = sinceBackup == null || sinceBackup >= EXPORT_REMINDER_DAYS

  return (
    <section>
      <SectionTitle help="Os dados ficam só neste dispositivo. Exporte de tempos em tempos para não perder tudo ao trocar de aparelho ou limpar o navegador.">
        Backup
      </SectionTitle>
      <Card className="flex flex-col gap-3">
        {stale && (
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-alerta">
            <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
            {sinceBackup == null ? 'Nenhum backup ainda' : `Último backup há ${sinceBackup} dias`}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportBackup} className="flex-1">
            <ArrowDownTrayIcon className="h-5 w-5" /> Exportar
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="flex-1">
            <ArrowUpTrayIcon className="h-5 w-5" /> Importar
          </Button>
        </div>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={onImportFile} className="hidden" />

        {pendingImport && (
          <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
            <p className="text-[14px] font-semibold text-ink">
              {pendingImport.summary.items} itens · {pendingImport.summary.purchases} compras ·{' '}
              {pendingImport.summary.contributions} aportes
            </p>
            <p className="text-[12px] text-sub">
              {pendingImport.summary.categories} categorias · formato {pendingImport.summary.version}
              {exportedAtLabel(pendingImport.summary.exportedAt) && ` · ${exportedAtLabel(pendingImport.summary.exportedAt)}`}
            </p>
            {totalSkipped(pendingImport.summary) > 0 && (
              <p className="text-[12px] font-medium text-alerta">
                {totalSkipped(pendingImport.summary)} registro(s) inválido(s) serão ignorados
              </p>
            )}
            <Button onClick={() => runImport('merge')}>Mesclar com os dados atuais</Button>
            <Button variant="destructive" onClick={() => runImport('replace')}>
              Substituir tudo
            </Button>
            <Button variant="ghost" onClick={() => setPendingImport(null)}>
              Cancelar
            </Button>
          </div>
        )}

        {error && <p className="text-[12.5px] font-medium text-erro">{error}</p>}
        {status && (
          <p className="flex items-center gap-1 text-[12.5px] font-medium text-ok">
            <CheckCircleIcon className="h-4 w-4" /> {status}
          </p>
        )}
      </Card>
    </section>
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
    <section>
      <SectionTitle help="Toque no nome para renomear. Categorias ocultas somem do cadastro e dos filtros; os itens delas continuam.">
        Categorias
      </SectionTitle>
      <Card className="flex flex-col p-2">
        <ul className="flex flex-col">
          {categories?.map((category) => {
            const count = items?.filter((i) => i.categoryId === category.id).length ?? 0
            return (
              <li
                key={category.id}
                className={`flex items-center gap-2 rounded-lg px-2 transition-opacity ${category.hidden ? 'opacity-50' : ''}`}
              >
                <CategoryIcon name={category.icon} className="h-4 w-4 shrink-0 text-accent" />
                <input
                  defaultValue={category.name}
                  key={category.name}
                  aria-label={`Nome da categoria ${category.name}`}
                  onBlur={(e) => rename(category, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="min-h-11 min-w-0 flex-1 rounded-md bg-transparent px-1 text-[15px] text-ink"
                />
                <span className="shrink-0 text-[12px] text-faint" title={`${count} itens`}>
                  {count}
                </span>
                <IconButton
                  label={category.hidden ? `Mostrar ${category.name}` : `Ocultar ${category.name}`}
                  aria-pressed={!!category.hidden}
                  onClick={() => db.categories.update(category.id, { hidden: !category.hidden })}
                >
                  {category.hidden ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </IconButton>
              </li>
            )
          })}
        </ul>
        <form onSubmit={add} className="mt-1 flex items-center gap-1 border-t border-line px-2 pt-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nova categoria"
            aria-label="Nome da nova categoria"
            className="min-h-11 min-w-0 flex-1 bg-transparent px-1 text-[15px] text-ink placeholder:text-faint"
          />
          <IconButton label="Adicionar categoria" type="submit" disabled={!newName.trim()} className="text-accent disabled:opacity-40">
            <PlusIcon className="h-5 w-5" />
          </IconButton>
        </form>
      </Card>
    </section>
  )
}
