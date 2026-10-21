'use client';

interface HealthScoreCardProps {
  score: number;
  trend?: 'up' | 'down' | 'stable';
  trendPercent?: number;
}

export function HealthScoreCard({
  score,
  trend = 'stable',
  trendPercent = 0,
}: HealthScoreCardProps) {
  const getColorClass = (score: number) => {
    if (score >= 80) return 'text-success-600 dark:text-success-400';
    if (score >= 60) return 'text-warning-600 dark:text-warning-400';
    return 'text-danger-600 dark:text-danger-400';
  };

  const getBgClass = (score: number) => {
    if (score >= 80) return 'bg-success-50 dark:bg-success-900/20';
    if (score >= 60) return 'bg-warning-50 dark:bg-warning-900/20';
    return 'bg-danger-50 dark:bg-danger-900/20';
  };

  const getTrendIcon = () => {
    switch (trend) {
      case 'up':
        return '📈';
      case 'down':
        return '📉';
      default:
        return '➡️';
    }
  };

  return (
    <div
      className={`rounded-lg border border-neutral-200 p-6 ${getBgClass(score)} dark:border-neutral-700`}
    >
      <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Health Score</h3>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className={`text-4xl font-bold ${getColorClass(score)}`}>{score}</div>
          {trendPercent !== 0 && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {getTrendIcon()} {Math.abs(trendPercent)}%{' '}
              {trend === 'up' ? 'improvement' : 'decline'} this month
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">out of 100</p>
          <div className="mt-2 h-2 w-32 rounded-full bg-neutral-200 dark:bg-neutral-700">
            <div
              className={`h-2 rounded-full transition-all ${
                score >= 80
                  ? 'bg-success-600 dark:bg-success-500'
                  : score >= 60
                    ? 'bg-warning-600 dark:bg-warning-500'
                    : 'bg-danger-600 dark:bg-danger-500'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
