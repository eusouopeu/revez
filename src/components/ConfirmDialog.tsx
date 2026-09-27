import { useEffect, useRef } from 'react'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * In-app replacement for `window.confirm`, which renders as a browser
 * dialog (with the localhost origin in the title) inside the Capacitor
 * build.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-6"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {message && <p className="mt-1 text-sm text-sub">{message}</p>}
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
