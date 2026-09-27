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
    <div className="mx-auto flex min-h-svh max-w-md flex-col bg-paper">
      <main className="flex-1 overflow-y-auto pb-20" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 border-t border-line bg-surface/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(({ to, label, Icon, Active, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className="flex flex-1 flex-col items-center gap-0.5 pb-2 pt-2.5"
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <Active className="h-6 w-6 text-accent" />
                ) : (
                  <Icon className="h-6 w-6 text-faint" />
                )}
                <span className={`text-[11px] font-medium ${isActive ? 'text-accent' : 'text-sub'}`}>
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
