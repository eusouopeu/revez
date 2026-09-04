import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { AppSettings, Item, Purchase } from '../domain/types'
import { nextReplacementDate } from '../domain/calculations'
import { formatBRL } from '../domain/format'

/**
 * Local notification ids are 32-bit ints. Each item gets two: a
 * lead-time reminder and a due-date alert, derived deterministically from
 * its uuid so rescheduling can cancel-then-recreate without tracking ids
 * separately. The monthly digest gets one fixed id.
 */
function idFor(itemId: string, kind: 'lead' | 'due'): number {
  let hash = 0
  for (const char of itemId) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const base = Math.abs(hash) % 1_000_000
  return kind === 'lead' ? base * 2 : base * 2 + 1
}

const DIGEST_NOTIFICATION_ID = 999_999_999

function isSupported(): boolean {
  return Capacitor.isNativePlatform()
}

/** Next occurrence of `dayOfMonth` at 09:00, today included if it hasn't passed yet. */
function nextMonthlyOccurrence(dayOfMonth: number, today: Date): Date {
  const candidate = new Date(today.getFullYear(), today.getMonth(), dayOfMonth, 9, 0, 0)
  if (candidate.getTime() <= today.getTime()) candidate.setMonth(candidate.getMonth() + 1)
  return candidate
}

/**
 * Cancels every notification this app owns and reschedules from current
 * data. Called after any change to items, purchases, or settings — cheap
 * enough given the item counts this app targets (dozens, not thousands).
 */
export async function syncNotifications(
  items: Item[],
  purchases: Purchase[],
  settings: AppSettings,
  totalMonthly: number,
  today: Date = new Date(),
): Promise<void> {
  if (!isSupported()) return

  const permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') {
    const requested = await LocalNotifications.requestPermissions()
    if (requested.display !== 'granted') return
  }

  const activeItems = items.filter((i) => i.status === 'active')
  const idsToCancel = activeItems.flatMap((item) => [
    { id: idFor(item.id, 'lead') },
    { id: idFor(item.id, 'due') },
  ])
  idsToCancel.push({ id: DIGEST_NOTIFICATION_ID })
  await LocalNotifications.cancel({ notifications: idsToCancel })

  const notifications: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = []

  for (const item of activeItems) {
    const targetDate = nextReplacementDate(item, purchases)
    if (!targetDate) continue

    const leadDate = new Date(targetDate)
    leadDate.setDate(leadDate.getDate() - settings.reminderLeadDays)
    if (leadDate.getTime() > today.getTime()) {
      notifications.push({
        id: idFor(item.id, 'lead'),
        title: 'Hora de planejar a troca',
        body: `${item.name} deve ser trocado em ${settings.reminderLeadDays} dias.`,
        schedule: { at: leadDate },
      })
    }

    if (targetDate.getTime() > today.getTime()) {
      notifications.push({
        id: idFor(item.id, 'due'),
        title: 'Item vencido para troca',
        body: `${item.name} chegou na data prevista de reposição.`,
        schedule: { at: targetDate },
      })
    }
  }

  notifications.push({
    id: DIGEST_NOTIFICATION_ID,
    title: 'Resumo mensal do Revez',
    body: `Guarde ${formatBRL(totalMonthly)} este mês para manter suas trocas em dia.`,
    schedule: { at: nextMonthlyOccurrence(settings.monthlyDigestDayOfMonth, today), repeats: true, every: 'month' },
  })

  if (notifications.length > 0) await LocalNotifications.schedule({ notifications })
}
