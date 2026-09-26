import { useState, useCallback } from 'react';

export interface UseModalOptions {
  onOpen?: () => void;
  onClose?: () => void;
  defaultOpen?: boolean;
}

export function useModal(options: UseModalOptions = {}) {
  const [isOpen, setIsOpen] = useState(options.defaultOpen ?? false);

  const open = useCallback(() => {
    setIsOpen(true);
    options.onOpen?.();
  }, [options]);

  const close = useCallback(() => {
    setIsOpen(false);
    options.onClose?.();
  }, [options]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    setIsOpen,
  };
}

export interface UseModalStackItem {
  id: string;
  onClose: () => void;
}

export function useModalStack(maxModals = 5) {
  const [stack, setStack] = useState<UseModalStackItem[]>([]);

  const push = useCallback(
    (modal: UseModalStackItem) => {
      setStack((prev) => {
        if (prev.length >= maxModals) {
          return prev;
        }
        return [...prev, modal];
      });
    },
    [maxModals]
  );

  const pop = useCallback((id: string) => {
    setStack((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const close = useCallback(
    (id: string) => {
      const modal = stack.find((m) => m.id === id);
      if (modal) {
        modal.onClose();
        pop(id);
      }
    },
    [stack, pop]
  );

  const getTopmost = useCallback(() => stack[stack.length - 1] ?? null, [stack]);

  return { stack, push, pop, close, getTopmost };
}
