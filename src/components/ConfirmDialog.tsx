import { useEffect, useRef } from 'react'

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-6"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
        {message && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{message}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            className="min-h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`min-h-11 flex-1 rounded-lg text-sm font-semibold text-white ${
              destructive ? 'bg-red-600 active:bg-red-700' : 'bg-violet-600 active:bg-violet-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
