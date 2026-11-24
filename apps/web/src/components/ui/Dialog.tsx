'use client';

import { useEffect, useRef, createContext, useContext, type ReactNode } from 'react';

// Dialog stack context for managing multiple modals
const DialogStackContext = createContext<{
  push: (id: string) => void;
  pop: (id: string) => void;
  isTopmost: (id: string) => boolean;
}>({
  push: () => {},
  pop: () => {},
  isTopmost: () => true,
});

export function DialogStackProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<string[]>([]);

  return (
    <DialogStackContext.Provider
      value={{
        push: (id) => {
          if (!stackRef.current.includes(id)) {
            stackRef.current.push(id);
          }
        },
        pop: (id) => {
          stackRef.current = stackRef.current.filter((item) => item !== id);
        },
        isTopmost: (id) => stackRef.current[stackRef.current.length - 1] === id,
      }}
    >
      {children}
    </DialogStackContext.Provider>
  );
}

export function useDialogStack() {
  return useContext(DialogStackContext);
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  id?: string;
  onEscape?: () => void;
  closeOnBackdropClick?: boolean;
  animated?: boolean;
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  size = 'md',
  id = `dialog-${Math.random().toString(36).substring(7)}`,
  onEscape,
  closeOnBackdropClick = true,
  animated = true,
}: DialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogStack = useDialogStack();

  useEffect(() => {
    if (open) {
      dialogStack.push(id);
      previousFocusRef.current = document.activeElement as HTMLElement;
      if (containerRef.current) containerRef.current.focus();

      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab' || !containerRef.current) return;
        const focusable = containerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      };

      document.addEventListener('keydown', handleTab);

      return () => {
        document.removeEventListener('keydown', handleTab);
        previousFocusRef.current?.focus();
        dialogStack.pop(id);
      };
    }
  }, [open, id, dialogStack]);

  useEffect(() => {
    if (!open) return;
    const isTopmost = dialogStack.isTopmost(id);
    if (!isTopmost) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape?.();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, id, dialogStack, onClose, onEscape]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = () => {
    if (closeOnBackdropClick) {
      onClose();
    }
  };

  return (
    <>
      <div
        ref={backdropRef}
        className={`fixed inset-0 z-40 bg-black/40 ${animated ? 'animate-fade-in' : ''}`}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={title ? `dialog-title-${id}` : undefined}
        aria-describedby={description ? `dialog-description-${id}` : undefined}
        className={[
          'fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2',
          'rounded-lg bg-white p-6 shadow-lg focus:outline-none dark:bg-neutral-800',
          sizeMap[size],
          animated ? 'animate-slide-in' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {(title || description) && (
          <div className="mb-4">
            {title && (
              <h2
                id={`dialog-title-${id}`}
                className="text-lg font-semibold text-neutral-800 dark:text-neutral-100"
              >
                {title}
              </h2>
            )}
            {description && (
              <p
                id={`dialog-description-${id}`}
                className="mt-1 text-sm text-neutral-500 dark:text-neutral-400"
              >
                {description}
              </p>
            )}
          </div>
        )}

        {children}

        <button
          onClick={onClose}
          className="focus:ring-primary-500 absolute right-4 top-4 rounded-md p-1 text-neutral-500 hover:text-neutral-700 focus:outline-none focus:ring-2 dark:text-neutral-400 dark:hover:text-neutral-200"
          aria-label="Close"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
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
    </>
  );
}
