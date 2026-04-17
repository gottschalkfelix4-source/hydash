import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { serverApi, monitoringApi } from '../services/api';
import { Play, Square, RotateCw, HardDrive, Clock, Terminal, Package, ArrowLeft, Activity, FolderOpen, Trash2, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import MetricCard from '../components/MetricCard';
import Console from '../components/Console';
import ModsManager from '../components/ModsManager';
import BackupsManager from '../components/BackupsManager';
import FileManager from '../components/FileManager';
import MonitoringCharts from '../components/MonitoringCharts';
import HytaleSetupWizard from '../components/HytaleSetupWizard';
import ScheduledTaskManager from '../components/ScheduledTaskManager';

type Tab = 'overview' | 'console' | 'mods' | 'backups' | 'tasks' | 'files' | 'monitoring' | 'setup';

export default function ServerDetail() {
  const { id: serverId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serverApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      navigate('/');
    },
  });

  const handleDelete = () => {
    if (confirm(`"${server?.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
      deleteMutation.mutate(safeServerId);
    }
  };

  const { data: serverData, isLoading: serverLoading } = useQuery({
    queryKey: ['server', serverId],
    queryFn: () => serverApi.get(serverId!),
    enabled: !!serverId,
  });

  const { data: metricsData } = useQuery({
    queryKey: ['metrics', serverId],
    queryFn: () => monitoringApi.current(serverId!),
    enabled: !!serverId,
    refetchInterval: 5000,
  });

  const { data: healthData } = useQuery({
    queryKey: ['health', serverId],
    queryFn: () => monitoringApi.health(serverId!),
    enabled: !!serverId,
    refetchInterval: 30000,
  });

  const safeServerId = serverId!;

  const server = serverData?.data?.data;
  const metrics = metricsData?.data?.data;
  const health = healthData?.data?.data;

  if (serverLoading) return <div className="text-gray-400 text-center py-12">Server wird geladen...</div>;
  if (!server) return <div className="text-red-400 text-center py-12">Server nicht gefunden</div>;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Übersicht', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'console', label: 'Konsole', icon: <Terminal className="w-4 h-4" /> },
    { id: 'monitoring', label: 'Monitoring', icon: <Activity className="w-4 h-4" /> },
    { id: 'mods', label: 'Mods', icon: <Package className="w-4 h-4" /> },
    { id: 'backups', label: 'Backups', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'tasks', label: 'Aufgaben', icon: <Clock className="w-4 h-4" /> },
    { id: 'files', label: 'Dateien', icon: <FolderOpen className="w-4 h-4" /> },
    { id: 'setup', label: 'Hytale Setup', icon: <Square className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{server.name}</h1>
            <p className="text-sm text-gray-400">Port {server.port} | {server.memoryLimitMb / 1024} GB RAM | Sichtweite {server.viewDistance}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <StatusBadge status={server.status} />
          <button onClick={() => serverApi.start(safeServerId)} className="p-2 bg-green-600 hover:bg-green-700 rounded text-white" title="Starten">
            <Play className="w-4 h-4" />
          </button>
          <button onClick={() => serverApi.stop(safeServerId)} className="p-2 bg-red-600 hover:bg-red-700 rounded text-white" title="Stoppen">
            <Square className="w-4 h-4" />
          </button>
          <button onClick={() => serverApi.restart(safeServerId)} className="p-2 bg-yellow-600 hover:bg-yellow-700 rounded text-white" title="Neustarten">
            <RotateCw className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-gray-700" />
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="p-2 bg-gray-700 hover:bg-red-600 rounded text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Server löschen"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700">
        <nav className="flex space-x-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-hydash-500 text-hydash-400'
                  : 'border-transparent text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              title="CPU"
              value={metrics?.cpuPercent?.toFixed(1) || '0'}
              unit="%"
              color="blue"
            />
            <MetricCard
              title="RAM"
              value={`${metrics?.memoryUsedMb?.toFixed(0) || '0'} / ${metrics?.memoryLimitMb?.toFixed(0) || '0'}`}
              unit="MB"
              color="purple"
            />
            <MetricCard
              title="Spieler"
              value={metrics?.playerCount != null ? String(metrics.playerCount) : '-'}
              unit={metrics?.maxPlayers != null ? `/ ${metrics.maxPlayers}` : undefined}
              color="green"
              icon={<Users className="w-6 h-6" />}
            />
            <MetricCard
              title="Netzwerk RX"
              value={((metrics?.networkRxBytes || 0) / 1024 / 1024).toFixed(1)}
              unit="MB"
              color="cyan"
            />
            <MetricCard
              title="Netzwerk TX"
              value={((metrics?.networkTxBytes || 0) / 1024 / 1024).toFixed(1)}
              unit="MB"
              color="yellow"
            />
          </div>

          {/* Health */}
          {health && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-white mb-2">Gesundheitsstatus</h3>
              <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${
                health.status === 'healthy' ? 'bg-green-500/20 text-green-400' :
                health.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                <span>{health.status === 'healthy' ? 'Gesund' : health.status === 'warning' ? 'Warnung' : 'Kritisch'}</span>
              </div>
              {health.issues?.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {health.issues.map((issue: { type: string; severity: string; message: string }, i: number) => (
                    <li key={i} className={`text-sm ${
                      issue.severity === 'critical' ? 'text-red-400' :
                      issue.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                    }`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Server Details */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Server-Details</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-400">ID</dt><dd className="text-gray-200 font-mono">{server.id}</dd>
              <dt className="text-gray-400">Port</dt><dd className="text-gray-200">{server.port}</dd>
              <dt className="text-gray-400">RAM</dt><dd className="text-gray-200">{server.memoryLimitMb / 1024} GB</dd>
              <dt className="text-gray-400">Sichtweite</dt><dd className="text-gray-200">{server.viewDistance} Chunks</dd>
              <dt className="text-gray-400">Autostart</dt><dd className="text-gray-200">{server.autostart ? 'Ja' : 'Nein'}</dd>
              <dt className="text-gray-400">Tags</dt><dd className="text-gray-200">{server.tags?.join(', ') || 'Keine'}</dd>
            </dl>
          </div>
        </div>
      )}

      {activeTab === 'console' && (
        <Console serverId={safeServerId} serverStatus={server.status} />
      )}

      {activeTab === 'monitoring' && (
        <MonitoringCharts serverId={safeServerId} />
      )}

      {activeTab === 'mods' && (
        <ModsManager serverId={safeServerId} />
      )}

      {activeTab === 'backups' && (
        <BackupsManager serverId={safeServerId} />
      )}

      {activeTab === 'tasks' && (
        <ScheduledTaskManager serverId={safeServerId} />
      )}

      {activeTab === 'files' && (
        <FileManager serverId={safeServerId} />
      )}

      {activeTab === 'setup' && (
        <HytaleSetupWizard serverId={safeServerId} />
      )}
    </div>
  );
}