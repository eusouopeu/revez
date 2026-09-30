import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent-fill text-white',
  secondary: 'bg-surface-2 text-ink',
  destructive: 'bg-erro text-white',
  ghost: 'text-sub',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-[14px] font-semibold disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
})
