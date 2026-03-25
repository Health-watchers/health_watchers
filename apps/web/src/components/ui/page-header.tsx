import React from 'react'
import { cn } from '@/lib/utils'

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, title, subtitle, actions, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex flex-col gap-4 pb-8 sm:flex-row sm:items-center sm:justify-between', className)}
        {...props}
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-secondary-900 sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="text-base text-secondary-600">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {actions}
          </div>
        )}
      </div>
    )
  }
)
PageHeader.displayName = 'PageHeader'

export { PageHeader }