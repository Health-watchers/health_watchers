'use client';

import { createContext, useContext, type ReactNode } from 'react';

interface TabsContextValue {
  active: string;
  onChange: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs subcomponents must be used inside <Tabs>');
  return ctx;
}

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ active: value, onChange: onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.role !== 'tab') return;

    const tabs = Array.from(e.currentTarget.querySelectorAll('[role="tab"]')) as HTMLElement[];
    const index = tabs.indexOf(target);

    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (e.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') nextIndex = 0;
    if (e.key === 'End') nextIndex = tabs.length - 1;

    if (nextIndex !== null) {
      e.preventDefault();
      tabs[nextIndex].focus();
      tabs[nextIndex].click();
    }
  };

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className={['flex gap-1 border-b border-neutral-200', className ?? ''].join(' ')}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { active, onChange } = useTabsContext();
  const isActive = active === value;

  return (
    <button
      role="tab"
      id={`tab-trigger-${value}`}
      aria-selected={isActive}
      aria-controls={`tab-panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      onClick={() => onChange(value)}
      className={[
        'focus-visible:ring-primary-500 -mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2',
        isActive
          ? 'border-primary-500 text-primary-500'
          : 'border-transparent text-neutral-500 hover:text-neutral-800',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const { active } = useTabsContext();
  if (active !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`tab-panel-${value}`}
      aria-labelledby={`tab-trigger-${value}`}
      tabIndex={0}
      className={['focus:outline-none pt-4', className ?? ''].join(' ')}
    >
      {children}
    </div>
  );
}
