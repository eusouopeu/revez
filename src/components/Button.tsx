import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'destructive'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-white active:bg-accent-strong',
  secondary: 'border border-line-strong text-ink',
  destructive: 'bg-erro text-white active:bg-erro-strong',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`min-h-11 rounded-lg text-sm font-semibold ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
})
