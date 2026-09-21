import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-normal cursor-pointer transition-colors duration-200',
  {
    variants: {
      variant: {
        green: 'bg-duo/10 text-duo-dark',
        blue: 'bg-duo-blue/10 text-duo-blue-dark',
        yellow: 'bg-duo-yellow/15 text-duo-yellow-dark',
        red: 'bg-duo-red/10 text-duo-red',
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
