import { NavLink, Outlet } from 'react-router-dom'
import { HomeIcon, PlusCircleIcon, Cog6ToothIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import {
  HomeIcon as HomeSolid,
  PlusCircleIcon as PlusSolid,
  Cog6ToothIcon as CogSolid,
  ChartBarIcon as ChartBarSolid,
} from '@heroicons/react/24/solid'

const tabs = [
  { to: '/', label: 'Início', Icon: HomeIcon, Active: HomeSolid, end: true },
  { to: '/dados', label: 'Dados', Icon: ChartBarIcon, Active: ChartBarSolid, end: false },
  { to: '/itens/novo', label: 'Novo item', Icon: PlusCircleIcon, Active: PlusSolid, end: false },
  { to: '/config', label: 'Ajustes', Icon: Cog6ToothIcon, Active: CogSolid, end: false },
]

export function Layout() {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col bg-slate-50 dark:bg-slate-950">
      <main className="flex-1 overflow-y-auto pb-20" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(({ to, label, Icon, Active, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className="flex flex-1 flex-col items-center gap-0.5 py-3"
          >
            {({ isActive }) =>
              isActive ? (
                <Active className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              ) : (
                <Icon className="h-6 w-6 text-slate-400" />
              )
            }
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
