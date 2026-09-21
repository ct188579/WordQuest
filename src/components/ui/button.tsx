import { forwardRef, useRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import gsap from 'gsap'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-normal transition-all duration-200 ease-out disabled:opacity-50 disabled:pointer-events-none cursor-pointer',
  {
    variants: {
      variant: {
        primary:
          'bg-duo text-white shadow-btn hover:bg-duo-light hover:-translate-y-px hover:shadow-card active:translate-y-0 active:shadow-none',
        secondary:
          'bg-duo-blue text-white shadow-btn hover:bg-duo-blue-dark hover:-translate-y-px hover:shadow-card active:translate-y-0 active:shadow-none',
        danger:
          'bg-duo-red text-white shadow-btn hover:bg-duo-red-dark hover:-translate-y-px hover:shadow-card active:translate-y-0 active:shadow-none',
        warning:
          'bg-duo-yellow text-ink shadow-btn hover:brightness-105 hover:-translate-y-px hover:shadow-card active:translate-y-0 active:shadow-none',
        outline:
          'border border-gray-300 bg-white text-duo-blue-dark hover:border-duo-blue/40 hover:bg-duo-blue/5 hover:-translate-y-px active:translate-y-0',
        ghost: 'bg-transparent text-ink-soft hover:bg-gray-100 hover:text-ink',
      },
      size: {
        sm: 'h-9 px-4 text-xs',
        md: 'h-11 px-5 text-sm',
        lg: 'h-13 px-7 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/** 学术风按钮：柔和浮起 + GSAP 轻微弹性反馈 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, onClick, children, ...props }, ref) => {
    const innerRef = useRef<HTMLButtonElement | null>(null)

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const el = innerRef.current
      if (el && !props.disabled) {
        gsap.fromTo(
          el,
          { scale: 0.96 },
          { scale: 1, duration: 0.35, ease: 'elastic.out(1.2, 0.5)', overwrite: 'auto' },
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
