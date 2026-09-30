import { NavLink, Outlet } from 'react-router-dom'
import { HomeIcon, PlusCircleIcon, Cog6ToothIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import {
  HomeIcon as HomeSolid,
  PlusCircleIcon as PlusSolid,
  Cog6ToothIcon as CogSolid,
  ChartBarIcon as ChartBarSolid,
} from '@heroicons/react/24/solid'

const TAB_BAR_H = 58

const tabs = [
  { to: '/', label: 'Início', Icon: HomeIcon, Active: HomeSolid, end: true },
  { to: '/dados', label: 'Dados', Icon: ChartBarIcon, Active: ChartBarSolid, end: false },
  { to: '/itens/novo', label: 'Novo item', Icon: PlusCircleIcon, Active: PlusSolid, end: false },
  { to: '/config', label: 'Ajustes', Icon: Cog6ToothIcon, Active: CogSolid, end: false },
]

export function Layout() {
  return (
    <div className="mx-auto min-h-svh max-w-[620px] bg-paper">
      <main style={{ paddingBottom: `calc(${TAB_BAR_H + 24}px + env(safe-area-inset-bottom))` }}>
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[620px] -translate-x-1/2 border-t border-line bg-surface"
        style={{ height: `calc(${TAB_BAR_H}px + env(safe-area-inset-bottom))`, paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {tabs.map(({ to, label, Icon, Active, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            title={label}
            className="flex flex-1 items-center justify-center"
          >
            {({ isActive }) =>
              isActive ? <Active className="h-6 w-6 text-accent" /> : <Icon className="h-6 w-6 text-sub" />
            }
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
