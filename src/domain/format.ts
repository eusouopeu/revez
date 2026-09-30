import { parseISODate } from './dates'

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** DD/MM/AAAA, independent of the device locale. */
export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? parseISODate(iso) : iso
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** "2026-03" -> "03/2026" */
export function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number)
  return `${pad2(month)}/${year}`
}

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
