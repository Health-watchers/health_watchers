import { Card } from '@/components/ui'

interface StatCardProps {
  title: string
  value: number | string
  icon: string
  color: 'blue' | 'green' | 'yellow' | 'indigo'
}

const colorMap: Record<StatCardProps['color'], string> = {
  blue:   'bg-primary-50 text-primary-600',
  green:  'bg-success-50 text-success-600',
  yellow: 'bg-warning-50 text-warning-600',
  indigo: 'bg-secondary-100 text-secondary-600',
}

export function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4">
      <div className={`rounded-full p-3 text-2xl ${colorMap[color]}`} aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="text-sm text-secondary-500">{title}</p>
        <p className="text-2xl font-bold text-secondary-900">{value}</p>
      </div>
    </Card>
  )
}
