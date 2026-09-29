'use client';

import React, { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

// ─── Controlled <Toast> (caller manages visibility via state) ──────────────────

interface ToastProps {
  message: string;
  type?: ToastVariant;
  onClose?: () => void;
  duration?: number;
}

export function Toast({ message, type = 'info', onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (!onClose) return;
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);

  const colors: Record<ToastVariant, string> = {
    success: 'bg-green-600 dark:bg-green-700',
    error: 'bg-red-600 dark:bg-red-700',
    info: 'bg-neutral-800 dark:bg-neutral-700',
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${colors[type]}`}
    >
      <span>{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss notification"
          className="ml-2 opacity-70 hover:opacity-100 focus:outline-none"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ─── Singleton event bus (for imperative toast.success(...) calls) ─────────────

type Listener = (item: ToastItem) => void;
const listeners: Set<Listener> = new Set();

let _counter = 0;
function emit(variant: ToastVariant, message: string) {
  const item: ToastItem = { id: `toast-${++_counter}`, message, variant };
  listeners.forEach((l) => l(item));
}

export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  info: (message: string) => emit('info', message),
};

// ─── Variant styles (dark-mode aware) ──────────────────────────────────────────

const variantStyles: Record<ToastVariant, string> = {
  success:
    'bg-green-50 border-green-600 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300',
  error:
    'bg-red-50 border-red-500 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300',
  info: 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300',
};

const icons: Record<ToastVariant, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

function ToastItemView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 4500);
    return () => clearTimeout(t);
  }, [item.id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg text-sm',
        variantStyles[item.variant],
      ].join(' ')}
    >
      <span className="mt-0.5 font-bold shrink-0">{icons[item.variant]}</span>
      <p className="flex-1">{item.message}</p>
      <button
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity text-base leading-none"
      >
        ×
      </button>
    </div>
  );
}

// ─── Toaster (mount once in layout) ────────────────────────────────────────────

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  useEffect(() => {
    const handler: Listener = (item) => setItems((prev) => [...prev, item]);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none"
    >
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <ToastItemView item={item} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
