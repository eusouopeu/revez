import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { IconButton } from './ui'
import { salvarTema, temaSalvo, type Tema } from '../lib/theme'

export function ThemeToggle() {
  const [tema, setTema] = useState<Tema>(temaSalvo)
  const escuro = tema === 'escuro'

  function alternar() {
    const proximo: Tema = escuro ? 'claro' : 'escuro'
    salvarTema(proximo)
    setTema(proximo)
  }

  return (
    <IconButton label={escuro ? 'Usar tema claro' : 'Usar tema escuro'} aria-pressed={escuro} onClick={alternar}>
      {escuro ? <MoonIcon className="h-5 w-5" /> : <SunIcon className="h-5 w-5" />}
    </IconButton>
  )
}

/** Tela com cabeçalho fixo: título + ações à direita + toggle de tema. */
export function Screen({
  title,
  back = false,
  actions,
  children,
}: {
  title: ReactNode
  back?: boolean
  actions?: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="px-4">
      <header
        className="sticky top-0 z-30 -mx-4 mb-4 flex items-center gap-1 border-b border-line bg-paper px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}
      >
        {back && (
          <IconButton label="Voltar" onClick={() => navigate(-1)} className="-ml-2 text-ink">
            <ArrowLeftIcon className="h-5 w-5" />
          </IconButton>
        )}
        <h1 className="min-w-0 flex-1 truncate text-[26px] font-extrabold leading-tight tracking-[-0.5px] text-ink">
          {title}
        </h1>
        {actions}
        <ThemeToggle />
      </header>
      {children}
    </div>
  )
}
