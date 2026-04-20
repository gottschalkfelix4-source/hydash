import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupApi } from '../services/api';
import { Plus, RotateCcw, Trash2, HardDrive, Clock } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';

interface BackupsProps {
  serverId: string;
}

export default function BackupsManager({ serverId }: BackupsProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [backupType, setBackupType] = useState<'full' | 'universe' | 'config'>('full');
  const [confirmState, setConfirmState] = useState<{open: boolean, onConfirm: () => void, title: string, message: string} | null>(null);
  const queryClient = useQueryClient();

  const { data: backupsData, isLoading } = useQuery({
    queryKey: ['backups', serverId],
    queryFn: async () => {
      const res = await backupApi.list(serverId);
      return res.data?.data || [];
    },
    enabled: !!serverId,
  });

  const createMutation = useMutation({
    mutationFn: (type: string) => backupApi.create(serverId, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups', serverId] });
      setShowCreate(false);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (backupId: string) => backupApi.restore(backupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups', serverId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (backupId: string) => backupApi.delete(backupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups', serverId] }),
  });

  const backups = backupsData || [];

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'full': return 'bg-blue-500/20 text-blue-400';
      case 'universe': return 'bg-purple-500/20 text-purple-400';
      case 'config': return 'bg-green-500/20 text-green-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'full': return 'Vollständig';
      case 'universe': return 'Universe';
      case 'config': return 'Config';
      default: return type;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Backups</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center space-x-2 px-3 py-1.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Backup erstellen</span>
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Backups werden geladen...</p>
      ) : backups.length === 0 ? (
        <div className="text-center py-8 bg-gray-800 rounded-lg border border-gray-700">
          <HardDrive className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-3">Keine Backups vorhanden</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors"
          >
            Erstes Backup erstellen
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {backups.map((backup: { id: string; filename: string; sizeBytes: number; backupType: string; createdAt: string; expiresAt: string | null }) => (
            <div key={backup.id} className="bg-gray-800 rounded border border-gray-700 p-3 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <p className="text-white text-sm font-medium truncate">{backup.filename}</p>
                  <span className={`px-2 py-0.5 text-xs rounded ${getTypeBadge(backup.backupType)}`}>
                    {getTypeLabel(backup.backupType)}
                  </span>
                </div>
                <div className="flex items-center space-x-4 mt-1 text-xs text-gray-400">
                  <span>{formatSize(backup.sizeBytes)}</span>
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(backup.createdAt).toLocaleString('de-DE')}</span>
                  </span>
                  {backup.expiresAt && (
                    <span>Läuft ab: {new Date(backup.expiresAt).toLocaleDateString('de-DE')}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-3">
                <button
                  onClick={() => { setConfirmState({open: true, onConfirm: () => restoreMutation.mutate(backup.id), title: 'Backup wiederherstellen', message: 'Backup wirklich wiederherstellen? Der Server wird gestoppt.'}); }}
                  disabled={restoreMutation.isPending}
                  className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                  title="Wiederherstellen"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setConfirmState({open: true, onConfirm: () => deleteMutation.mutate(backup.id), title: 'Backup löschen', message: 'Backup wirklich löschen?'}); }}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                  title="Löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold text-white mb-4">Backup erstellen</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Typ</label>
                <select
                  value={backupType}
                  onChange={(e) => setBackupType(e.target.value as 'full' | 'universe' | 'config')}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
                >
                  <option value="full">Vollständig</option>
                  <option value="universe">Universe (Welt-Daten)</option>
                  <option value="config">Config (Nur Konfiguration)</option>
                </select>
              </div>
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => createMutation.mutate(backupType)}
                disabled={createMutation.isPending}
                className="flex-1 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Erstelle...' : 'Erstellen'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmState}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        confirmVariant="danger"
      />
    </div>
  );
}