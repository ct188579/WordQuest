import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-12 w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 text-base font-semibold text-ink',
        'placeholder:font-normal placeholder:text-gray-400 outline-none transition-colors',
        'focus:border-duo-blue focus:bg-white',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-base font-semibold text-ink',
        'placeholder:font-normal placeholder:text-gray-400 outline-none transition-colors',
        'focus:border-duo-blue focus:bg-white min-h-24',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
