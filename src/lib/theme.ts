import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'

export type Tema = 'claro' | 'escuro'

const KEY = 'revez-tema'

// Literal hex for native APIs — keep in sync with --color-paper in index.css.
const BAR_COLOR: Record<Tema, string> = { claro: '#f5f5f8', escuro: '#14181c' }

export function temaSalvo(): Tema {
  try {
    return localStorage.getItem(KEY) === 'escuro' ? 'escuro' : 'claro'
  } catch {
    return 'claro'
  }
}

export function aplicarTema(tema: Tema): void {
  const root = document.documentElement
  if (tema === 'escuro') root.setAttribute('data-tema', 'escuro')
  else root.removeAttribute('data-tema')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[tema])

  if (Capacitor.isNativePlatform()) {
    StatusBar.setOverlaysWebView({ overlay: false })
    // Style.Light = dark icons (light bar); Style.Dark = light icons.
    StatusBar.setStyle({ style: tema === 'escuro' ? Style.Dark : Style.Light })
    StatusBar.setBackgroundColor({ color: BAR_COLOR[tema] })
  }
}

export function salvarTema(tema: Tema): void {
  aplicarTema(tema)
  try {
    localStorage.setItem(KEY, tema)
  } catch {
    // Sem storage o tema vale só para esta sessão.
  }
}
