'use client'

import React, { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export interface SlideOverProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  width?: string
  footer?: React.ReactNode
}

const SlideOver = React.forwardRef<HTMLDivElement, SlideOverProps>(
  (
    {
      isOpen,
      onClose,
      title,
      subtitle,
      children,
      width = 'w-full sm:w-96',
      footer,
      className,
      ...props
    },
    ref
  ) => {
    // Close on Escape key
    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) {
          onClose()
        }
      }

      if (isOpen) {
        document.addEventListener('keydown', handleEscape)
        document.body.style.overflow = 'hidden'
      }

      return () => {
        document.removeEventListener('keydown', handleEscape)
        document.body.style.overflow = 'unset'
      }
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-300"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Slide Over Panel */}
        <div
          ref={ref}
          className={cn(
            'fixed right-0 top-0 z-50 h-full flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out',
            width,
            isOpen ? 'translate-x-0' : 'translate-x-full',
            className
          )}
          {...props}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-secondary-200 px-6 py-4">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-secondary-900">{title}</h2>
              {subtitle && (
                <p className="text-sm text-secondary-600">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md hover:bg-secondary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              aria-label="Close panel"
            >
              <svg
                className="h-6 w-6 text-secondary-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="border-t border-secondary-200 px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </>
    )
  }
)

SlideOver.displayName = 'SlideOver'

export { SlideOver }
