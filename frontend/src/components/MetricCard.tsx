import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan' | 'orange';
}

const colorClasses = {
  blue: 'border-blue-500/30 text-blue-400',
  green: 'border-green-500/30 text-green-400',
  yellow: 'border-yellow-500/30 text-yellow-400',
  red: 'border-red-500/30 text-red-400',
  purple: 'border-purple-500/30 text-purple-400',
  cyan: 'border-cyan-500/30 text-cyan-400',
  orange: 'border-orange-500/30 text-orange-400',
};

export default function MetricCard({
  title,
  value,
  unit,
  trend,
  trendValue,
  icon,
  color = 'blue',
}: MetricCardProps) {
  return (
    <div className={clsx('metric-card', colorClasses[color])}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className="mt-1 text-2xl font-semibold">
            {typeof value === 'number' ? value.toLocaleString() : value}
            {unit && <span className="ml-1 text-sm text-gray-500">{unit}</span>}
          </p>
        </div>
        {icon && <div className="opacity-50">{icon}</div>}
      </div>
      {(trend || trendValue) && (
        <div className="mt-2 flex items-center text-xs">
          {trend === 'up' && <TrendingUp className="w-3 h-3 mr-1" />}
          {trend === 'down' && <TrendingDown className="w-3 h-3 mr-1" />}
          {trend === 'stable' && <Minus className="w-3 h-3 mr-1" />}
          {trendValue && <span>{trendValue}</span>}
        </div>
      )}
    </div>
  );
}