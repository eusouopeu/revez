import { forwardRef, useEffect, useId, useRef, useState } from 'react'
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

/** (i) icon that shows an explanation in a floating popover (tap, hover or focus). */
export function HelpPopover({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function close() {
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', close, { passive: true })
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close)
    }
  }, [open])

  return (
    <div
      ref={ref}
      className="relative"
      // Hover only for real mice: on touch the tap itself toggles it.
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
    >
      <IconButton
        label="Ver explicação"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`h-8 w-8 ${open ? 'text-accent' : 'text-faint'}`}
      >
        <InformationCircleIcon className="h-[18px] w-[18px]" />
      </IconButton>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="popover-in absolute right-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-32px)] rounded-lg bg-ink px-3 py-2.5 text-[12.5px] font-normal normal-case leading-relaxed tracking-normal text-paper shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** Section title plus an optional explanation behind an (i) popover. */
export function SectionTitle({ children, help, action }: { children: ReactNode; help?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex min-h-10 items-center gap-1">
      <h2 className="rotulo flex-1">{children}</h2>
      {help && <HelpPopover>{help}</HelpPopover>}
      {action}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-[13.5px] leading-relaxed text-sub">{children}</p>
}
