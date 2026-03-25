import React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const pageWrapperVariants = cva(
  'mx-auto w-full',
  {
    variants: {
      maxWidth: {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-4xl',
        xl: 'max-w-6xl',
        '2xl': 'max-w-7xl',
        full: 'max-w-full',
      },
      padding: {
        none: '',
        default: 'px-4 sm:px-6 lg:px-8',
      },
    },
    defaultVariants: {
      maxWidth: 'xl',
      padding: 'default',
    },
  }
)

export interface PageWrapperProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof pageWrapperVariants> {}

const PageWrapper = React.forwardRef<HTMLDivElement, PageWrapperProps>(
  ({ className, maxWidth, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(pageWrapperVariants({ maxWidth, padding, className }))}
        {...props}
      />
    )
  }
)
PageWrapper.displayName = 'PageWrapper'

export { PageWrapper }