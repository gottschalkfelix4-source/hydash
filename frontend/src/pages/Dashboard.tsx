import { useQuery } from '@tanstack/react-query';
import { monitoringApi } from '../services/api';
import MetricCard from '../components/MetricCard';
import { Cpu, MemoryStick, HardDrive, Container, Server, Wifi, Clock, Monitor } from 'lucide-react';

interface SystemInfo {
  cpu: { model: string; cores: number; loadAvg: [number, number, number]; usagePercent: number };
  memory: { totalMb: number; usedMb: number; freeMb: number; usagePercent: number };
  disk: { totalGb: number; usedGb: number; freeGb: number; usagePercent: number };
  uptime: number;
  hostname: string;
  platform: string;
  osRelease: string;
  docker: { version: string; containersRunning: number; containersPaused: number; containersStopped: number; images: number };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function UsageBar({ percent, color }: { percent: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    cyan: 'bg-cyan-500',
  };
  return (
    <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
      <div
        className={`${colorMap[color] || 'bg-blue-500'} h-2 rounded-full transition-all`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

export default function Dashboard() {
  const { data: systemData } = useQuery({
    queryKey: ['system-info'],
    queryFn: () => monitoringApi.system(),
    refetchInterval: 10000,
  });

  const { data: overviewData } = useQuery({
    queryKey: ['monitoring-overview'],
    queryFn: () => monitoringApi.overview(),
    refetchInterval: 30000,
  });

  const system: SystemInfo | null = systemData?.data?.data || null;
  const overview = overviewData?.data?.data || { totalServers: 0, onlineServers: 0, totalMemoryUsed: 0, totalMemoryLimit: 0 };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {system ? (
        <>
          {/* System Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="CPU-Auslastung"
              value={`${system.cpu.usagePercent}%`}
              icon={<Cpu className="w-6 h-6" />}
              color={system.cpu.usagePercent > 80 ? 'red' : system.cpu.usagePercent > 50 ? 'yellow' : 'blue'}
            />
            <MetricCard
              title="RAM genutzt"
              value={`${(system.memory.usedMb / 1024).toFixed(1)} / ${(system.memory.totalMb / 1024).toFixed(1)}`}
              unit="GB"
              icon={<MemoryStick className="w-6 h-6" />}
              color={system.memory.usagePercent > 85 ? 'red' : system.memory.usagePercent > 60 ? 'yellow' : 'purple'}
            />
            <MetricCard
              title="Festplatte genutzt"
              value={`${system.disk.usedGb} / ${system.disk.totalGb}`}
              unit="GB"
              icon={<HardDrive className="w-6 h-6" />}
              color={system.disk.usagePercent > 90 ? 'red' : system.disk.usagePercent > 70 ? 'yellow' : 'cyan'}
            />
            <MetricCard
              title="Uptime"
              value={formatUptime(system.uptime)}
              icon={<Clock className="w-6 h-6" />}
              color="green"
            />
          </div>

          {/* Usage Bars */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-300">CPU</span>
                <span className="text-sm text-gray-400">{system.cpu.usagePercent}%</span>
              </div>
              <UsageBar percent={system.cpu.usagePercent} color="blue" />
              <p className="text-xs text-gray-500 mt-2">{system.cpu.model}</p>
              <p className="text-xs text-gray-500">{system.cpu.cores} Kerne | Load: {system.cpu.loadAvg[0].toFixed(2)} / {system.cpu.loadAvg[1].toFixed(2)} / {system.cpu.loadAvg[2].toFixed(2)}</p>
            </div>

            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-300">RAM</span>
                <span className="text-sm text-gray-400">{system.memory.usagePercent}%</span>
              </div>
              <UsageBar percent={system.memory.usagePercent} color="purple" />
              <p className="text-xs text-gray-500 mt-2">{(system.memory.usedMb / 1024).toFixed(1)} GB von {(system.memory.totalMb / 1024).toFixed(1)} GB genutzt</p>
              <p className="text-xs text-gray-500">{(system.memory.freeMb / 1024).toFixed(1)} GB verfügbar</p>
            </div>

            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-300">Festplatte</span>
                <span className="text-sm text-gray-400">{system.disk.usagePercent}%</span>
              </div>
              <UsageBar percent={system.disk.usagePercent} color="cyan" />
              <p className="text-xs text-gray-500 mt-2">{system.disk.usedGb} GB von {system.disk.totalGb} GB genutzt</p>
              <p className="text-xs text-gray-500">{system.disk.freeGb} GB verfügbar</p>
            </div>
          </div>

          {/* Docker & System Info + Server Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Docker Info */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Container className="w-5 h-5 text-hydash-400" />
                <h3 className="text-lg font-semibold text-white">Docker</h3>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-gray-400">Version</dt>
                <dd className="text-gray-200">{system.docker.version}</dd>
                <dt className="text-gray-400">Container aktiv</dt>
                <dd className="text-green-400">{system.docker.containersRunning}</dd>
                <dt className="text-gray-400">Container pausiert</dt>
                <dd className="text-yellow-400">{system.docker.containersPaused}</dd>
                <dt className="text-gray-400">Container gestoppt</dt>
                <dd className="text-gray-300">{system.docker.containersStopped}</dd>
                <dt className="text-gray-400">Images</dt>
                <dd className="text-gray-200">{system.docker.images}</dd>
              </dl>
            </div>

            {/* System Info */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <div className="flex items-center space-x-2 mb-3">
                <Monitor className="w-5 h-5 text-hydash-400" />
                <h3 className="text-lg font-semibold text-white">System</h3>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-gray-400">Hostname</dt>
                <dd className="text-gray-200">{system.hostname}</dd>
                <dt className="text-gray-400">Plattform</dt>
                <dd className="text-gray-200">{system.platform}</dd>
                <dt className="text-gray-400">OS Release</dt>
                <dd className="text-gray-200">{system.osRelease}</dd>
                <dt className="text-gray-400">CPU Kerne</dt>
                <dd className="text-gray-200">{system.cpu.cores}</dd>
                <dt className="text-gray-400">RAM gesamt</dt>
                <dd className="text-gray-200">{(system.memory.totalMb / 1024).toFixed(1)} GB</dd>
              </dl>
            </div>
          </div>

          {/* Server Overview */}
          <div>
            <h2 className="text-lg font-semibold text-gray-300 mb-4">Server-Übersicht</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MetricCard
                title="Server gesamt"
                value={overview.totalServers}
                color="blue"
                icon={<Server className="w-6 h-6" />}
              />
              <MetricCard
                title="Server online"
                value={overview.onlineServers}
                color="green"
                icon={<Wifi className="w-6 h-6" />}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12 text-gray-400">Systeminformationen werden geladen...</div>
      )}
    </div>
  );
}