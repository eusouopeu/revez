import { parseISODate } from './dates'

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? parseISODate(iso) : iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
