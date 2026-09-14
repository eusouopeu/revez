import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import './index.css'
import App from './App.tsx'

if (Capacitor.isNativePlatform()) {
  // Capacitor's Style.Light means dark icons (for light backgrounds) and
  // Style.Dark means light icons — using Dark on a white bar hid everything
  // except the battery percentage. Follow the system theme instead.
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const applyStatusBar = () => {
    const dark = darkQuery.matches
    StatusBar.setOverlaysWebView({ overlay: false })
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
    StatusBar.setBackgroundColor({ color: dark ? '#020617' : '#f8fafc' })
  }
  applyStatusBar()
  darkQuery.addEventListener('change', applyStatusBar)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
