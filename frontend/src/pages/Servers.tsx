import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Server as ServerIcon, Wifi, MemoryStick, Cpu } from 'lucide-react';
import { serverApi, monitoringApi } from '@/services/api';
import ServerCard from '@/components/ServerCard';
import MetricCard from '@/components/MetricCard';
import CreateServerModal from '@/components/CreateServerModal';
import ConfirmModal from '@/components/ConfirmModal';
import type { Server } from '@/types';

export default function Servers() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: serversData, isLoading: serversLoading, refetch: refetchServers } = useQuery({
    queryKey: ['servers'],
    queryFn: () => serverApi.list(),
    refetchInterval: 10000,
  });

  const { data: overviewData } = useQuery({
    queryKey: ['monitoring-overview'],
    queryFn: () => monitoringApi.overview(),
    refetchInterval: 30000,
  });

  const servers: Server[] = serversData?.data?.data || [];
  const overview = overviewData?.data?.data || {
    totalServers: 0,
    onlineServers: 0,
    totalMemoryUsed: 0,
    totalMemoryLimit: 0,
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['servers'] });
    queryClient.invalidateQueries({ queryKey: ['monitoring-overview'] });
  };

  const startMutation = useMutation({
    mutationFn: (id: string) => serverApi.start(id),
    onSuccess: invalidateAll,
    onError: (err) => setError(err instanceof Error ? err.message : 'Fehler beim Starten'),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => serverApi.stop(id),
    onSuccess: invalidateAll,
    onError: (err) => setError(err instanceof Error ? err.message : 'Fehler beim Stoppen'),
  });

  const restartMutation = useMutation({
    mutationFn: (id: string) => serverApi.restart(id),
    onSuccess: invalidateAll,
    onError: (err) => setError(err instanceof Error ? err.message : 'Fehler beim Neustarten'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serverApi.delete(id),
    onSuccess: () => { invalidateAll(); setDeleteTarget(null); },
    onError: (err) => { setError(err instanceof Error ? err.message : 'Fehler beim Löschen'); setDeleteTarget(null); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Server</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Server erstellen</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-4 font-medium">Schließen</button>
        </div>
      )}

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Server gesamt"
          value={overview.totalServers}
          color="blue"
          icon={<ServerIcon className="w-6 h-6" />}
        />
        <MetricCard
          title="Server online"
          value={overview.onlineServers}
          color="green"
          icon={<Wifi className="w-6 h-6" />}
        />
        <MetricCard
          title="RAM genutzt"
          value={`${(overview.totalMemoryUsed / 1024).toFixed(1)} GB`}
          color="purple"
          icon={<MemoryStick className="w-6 h-6" />}
        />
        <MetricCard
          title="RAM gesamt"
          value={`${(overview.totalMemoryLimit / 1024).toFixed(1)} GB`}
          color="cyan"
          icon={<Cpu className="w-6 h-6" />}
        />
      </div>

      {/* Server Grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-300 mb-4">Server</h2>
        {serversLoading ? (
          <div className="text-center text-gray-400 py-12">Server werden geladen...</div>
        ) : servers.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
            <ServerIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-4">Keine Server vorhanden</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg transition-colors"
            >
              Ersten Server erstellen
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onStart={(id) => startMutation.mutate(id)}
                onStop={(id) => stopMutation.mutate(id)}
                onRestart={(id) => restartMutation.mutate(id)}
                onDelete={(id) => {
                  const s = servers.find(s => s.id === id);
                  if (s) setDeleteTarget({ id: s.id, name: s.name });
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateServerModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); refetchServers(); }}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
        title="Server löschen"
        message={`„${deleteTarget?.name}" wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        confirmVariant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}