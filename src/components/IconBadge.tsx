import * as Icons from '@heroicons/react/24/outline'
import type { ComponentType, SVGProps } from 'react'

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const icons = Icons as unknown as Record<string, HeroIcon>
  const Cmp = icons[name] ?? Icons.CubeIcon
  return <Cmp className={className} />
}
