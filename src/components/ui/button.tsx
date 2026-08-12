import { forwardRef, useRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import gsap from 'gsap'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold uppercase tracking-wide transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-duo text-white hover:bg-duo-light shadow-[0_4px_0_#46A302] active:shadow-none active:translate-y-1',
        secondary: 'bg-duo-blue text-white hover:brightness-105 shadow-[0_4px_0_#1899D6] active:shadow-none active:translate-y-1',
        danger: 'bg-duo-red text-white hover:brightness-105 shadow-[0_4px_0_#EA2B2B] active:shadow-none active:translate-y-1',
        warning: 'bg-duo-yellow text-ink hover:brightness-105 shadow-[0_4px_0_#E0A800] active:shadow-none active:translate-y-1',
        outline: 'bg-white text-duo-blue border-2 border-gray-200 border-b-4 hover:bg-gray-50 active:border-b-2 active:translate-y-0.5',
        ghost: 'bg-transparent text-ink-soft hover:bg-gray-100',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        md: 'h-12 px-6 text-sm',
        lg: 'h-14 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/** Duolingo 风格按钮：点击时 GSAP 弹性缩放反馈 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, onClick, children, ...props }, ref) => {
    const innerRef = useRef<HTMLButtonElement | null>(null)

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = innerRef.current
      if (el && !props.disabled) {
        gsap.fromTo(
          el,
          { scale: 0.94 },
          { scale: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.4)', overwrite: 'auto' },
        )
      }
      onClick?.(e)
    }

    return (
      <button
        ref={(node) => {
          innerRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        className={cn(buttonVariants({ variant, size }), className)}
        onClick={handleClick}
        {...props}
      >
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
