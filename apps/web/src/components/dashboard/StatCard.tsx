import { Card } from '@/components/ui';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: string;
  color: 'blue' | 'green' | 'yellow' | 'indigo';
  /** Optional accessible label for the card */
  label?: string;
}

const colorMap: Record<StatCardProps['color'], string> = {
  blue: 'bg-primary-50 text-primary-600',
  green: 'bg-success-50 text-success-700',
  yellow: 'bg-neutral-100 text-neutral-600',
  indigo: 'bg-primary-100 text-primary-700',
};

export function StatCard({ title, value, icon, color, label }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4" role="region" aria-label={label ?? title}>
      <div className={`rounded-full p-3 text-2xl ${colorMap[color]}`} aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="text-sm text-neutral-500">{title}</p>
        <p className="text-2xl font-bold text-neutral-900">{value}</p>
      </div>
    </Card>
  );
}
