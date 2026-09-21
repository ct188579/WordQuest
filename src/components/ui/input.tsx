import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-[15px] font-medium text-ink',
        'shadow-[inset_0_1px_2px_rgb(35_40_46/0.04)] placeholder:font-normal placeholder:text-gray-400',
        'outline-none transition-all duration-200 ease-out',
        'focus:border-duo focus:ring-4 focus:ring-duo/10',
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
        'min-h-24 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[15px] font-medium text-ink',
        'shadow-[inset_0_1px_2px_rgb(35_40_46/0.04)] placeholder:font-normal placeholder:text-gray-400',
        'outline-none transition-all duration-200 ease-out',
        'focus:border-duo focus:ring-4 focus:ring-duo/10',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
