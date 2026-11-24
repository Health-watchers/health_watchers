import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'indigo';
  /** Optional accessible label for the card */
  label?: string;
  /** Optional flag to highlight the card when the value changes (real-time updates) */
  live?: boolean;
}

const colorMap: Record<StatCardProps['color'], string> = {
  blue: 'bg-primary-50 text-primary-600',
  green: 'bg-success-50 text-success-700',
  yellow: 'bg-neutral-100 text-neutral-600',
  indigo: 'bg-primary-100 text-primary-700',
};

export function StatCard({ title, value, icon, color, label, live }: StatCardProps) {
  const [highlighted, setHighlighted] = useState(false);
  const prevValueRef = useRef<number | string>(value);

  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      if (live) {
        setHighlighted(true);
        const timeout = setTimeout(() => setHighlighted(false), 1000);
        return () => clearTimeout(timeout);
      }
    }
    return undefined;
  }, [value, live]);

  return (
    <Card
      className={`flex items-center gap-4 transition-colors duration-500 ${
        highlighted ? 'ring-2 ring-primary-400 bg-primary-50/60' : ''
      }`}
      role="region"
      aria-label={label ?? title}
      data-live={live ? 'true' : undefined}
      data-highlighted={highlighted ? 'true' : undefined}
    >
      <div className={`rounded-full p-3 text-2xl ${colorMap[color]}`} aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{title}</p>
        <p
          className={`text-2xl font-bold text-neutral-900 dark:text-neutral-100 transition-transform duration-300 ${
            highlighted ? 'scale-110' : ''
          }`}
          aria-live="polite"
        >
          {value}
        </p>
      </div>
    </Card>
  );
}