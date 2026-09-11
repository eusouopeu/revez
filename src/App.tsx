import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { ItemForm } from './pages/ItemForm'
import { ItemDetail } from './pages/ItemDetail'
import { Settings } from './pages/Settings'
import { DataPage } from './pages/Data'
import { seedIfEmpty } from './db/db'
import { useNotificationsSync } from './hooks/useNotificationsSync'

export default function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    seedIfEmpty().then(() => setReady(true))
  }, [])

  useNotificationsSync()

  if (!ready) return null

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/itens/novo" element={<ItemForm />} />
          <Route path="/itens/:id" element={<ItemDetail />} />
          <Route path="/itens/:id/editar" element={<ItemForm />} />
          <Route path="/dados" element={<DataPage />} />
          <Route path="/config" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
