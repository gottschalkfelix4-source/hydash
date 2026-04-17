import clsx from 'clsx';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  showPulse?: boolean;
}

const statusConfig: Record<string, { label: string; color: string; pulse: boolean }> = {
  running: { label: 'Online', color: 'bg-green-500/20 text-green-400 border-green-500/30', pulse: true },
  starting: { label: 'Startet...', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', pulse: true },
  stopped: { label: 'Gestoppt', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', pulse: false },
  stopping: { label: 'Stoppt...', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', pulse: true },
  error: { label: 'Fehler', color: 'bg-red-500/20 text-red-400 border-red-500/30', pulse: false },
  creating: { label: 'Erstellt...', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', pulse: true },
};

export default function StatusBadge({ status, size = 'md', showPulse = true }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.stopped;
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center space-x-1.5 rounded-full border font-medium',
        config.color,
        sizeClasses[size]
      )}
    >
      {showPulse && config.pulse && (
        <span className="relative flex h-2 w-2">
          <span className={clsx('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', {
            'bg-green-400': status === 'running',
            'bg-yellow-400': status === 'starting' || status === 'stopping',
            'bg-blue-400': status === 'creating',
          })} />
          <span className={clsx('relative inline-flex rounded-full h-2 w-2', {
            'bg-green-500': status === 'running',
            'bg-yellow-500': status === 'starting' || status === 'stopping',
            'bg-blue-500': status === 'creating',
          })} />
        </span>
      )}
      <span>{config.label}</span>
    </span>
  );
}