import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide cursor-pointer transition-colors',
  {
    variants: {
      variant: {
        green: 'bg-duo/15 text-duo-dark',
        blue: 'bg-duo-blue/15 text-duo-blue-dark',
        yellow: 'bg-duo-yellow/25 text-duo-yellow-dark',
        red: 'bg-duo-red/15 text-duo-red',
        gray: 'bg-gray-100 text-ink-soft',
      },
    },
    defaultVariants: { variant: 'gray' },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
