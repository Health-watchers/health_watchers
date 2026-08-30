'use client';

import type { ReactNode } from 'react';

export function ModalHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`mb-4 ${className ?? ''}`}>{children}</div>;
}

export function ModalTitle({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <h2
      id={id}
      className={`text-lg font-semibold text-neutral-800 dark:text-neutral-100 ${className ?? ''}`}
    >
      {children}
    </h2>
  );
}

export function ModalDescription({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <p id={id} className={`mt-1 text-sm text-neutral-500 dark:text-neutral-400 ${className ?? ''}`}>
      {children}
    </p>
  );
}

export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-4 ${className ?? ''}`}>{children}</div>;
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex items-center justify-end gap-3 border-t border-neutral-100 pt-4 dark:border-neutral-700 ${
        className ?? ''
      }`}
    >
      {children}
    </div>
  );
}

export function ModalContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-4 ${className ?? ''}`}>{children}</div>;
}
