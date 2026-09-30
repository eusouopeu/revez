import { forwardRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { InformationCircleIcon } from '@heroicons/react/24/outline'

export const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-faint'

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl bg-surface p-4 ${className}`}>{children}</div>
}

/** Label em cima, controle embaixo — o rótulo usa o estilo canônico `rotulo`. */
export function Field({ label, className = '', children }: { label: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="rotulo">{label}</span>
      {children}
    </label>
  )
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  function IconButton({ label, className = '', children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sub ${className}`}
        {...props}
      >
        {children}
      </button>
    )
  },
)

/** Section title plus an optional collapsed explanation behind an (i) icon. */
export function SectionTitle({ children, help, action }: { children: ReactNode; help?: ReactNode; action?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-2">
      <div className="flex min-h-10 items-center gap-1">
        <h2 className="rotulo flex-1">{children}</h2>
        {help && (
          <IconButton
            label={open ? 'Ocultar explicação' : 'Ver explicação'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`h-8 w-8 ${open ? 'text-accent' : 'text-faint'}`}
          >
            <InformationCircleIcon className="h-[18px] w-[18px]" />
          </IconButton>
        )}
        {action}
      </div>
      {help && open && <p className="mb-1 text-[12.5px] leading-relaxed text-sub">{help}</p>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-[13.5px] leading-relaxed text-sub">{children}</p>
}
