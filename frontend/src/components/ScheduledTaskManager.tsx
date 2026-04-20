import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '@/services/api';
import { Plus, Play, Trash2, ToggleLeft, ToggleRight, Clock, Loader2 } from 'lucide-react';
import type { ScheduledTask } from '@/types';
import { TASK_TYPES } from '@/types';
import ConfirmModal from '@/components/ConfirmModal';

interface TasksManagerProps {
  serverId: string;
}

type Task = ScheduledTask;

const CRON_PRESETS = [
  { label: 'Jede Stunde', value: '0 * * * *' },
  { label: 'Alle 6 Stunden', value: '0 */6 * * *' },
  { label: 'Täglich 3:00', value: '0 3 * * *' },
  { label: 'Täglich 6:00', value: '0 6 * * *' },
  { label: 'Wöchentlich (So 3:00)', value: '0 3 * * 0' },
  { label: 'Alle 30 Min', value: '*/30 * * * *' },
];

export default function ScheduledTaskManager({ serverId }: TasksManagerProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmState, setConfirmState] = useState<{open: boolean, onConfirm: () => void, title: string, message: string} | null>(null);
  const [newTask, setNewTask] = useState({
    name: '',
    taskType: 'restart',
    cronExpression: '',
    command: '',
  });

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', serverId],
    queryFn: () => taskApi.list(serverId),
    enabled: !!serverId,
  });

  const tasks: Task[] = tasksData?.data?.data || [];

  const toggleMutation = useMutation({
    mutationFn: (taskId: string) => {
      const task = tasks.find(t => t.id === taskId);
      return task?.enabled ? taskApi.disable(taskId) : taskApi.enable(taskId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', serverId] }),
  });

  const executeMutation = useMutation({
    mutationFn: (taskId: string) => taskApi.execute(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', serverId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => taskApi.delete(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', serverId] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => taskApi.create(serverId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', serverId] });
      setShowCreate(false);
      setNewTask({ name: '', taskType: 'restart', cronExpression: '', command: '' });
    },
  });

  const handleCreate = () => {
    createMutation.mutate({
      name: newTask.name,
      taskType: newTask.taskType,
      cronExpression: newTask.cronExpression || null,
      command: newTask.taskType === 'command' ? newTask.command : null,
      enabled: true,
    });
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'success': return 'bg-green-500/20 text-green-400';
      case 'failed': return 'bg-red-500/20 text-red-400';
      case 'running': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getStatusLabel = (status: string | null) => {
    switch (status) {
      case 'success': return 'Erfolgreich';
      case 'failed': return 'Fehlgeschlagen';
      case 'running': return 'Läuft';
      default: return status || '-';
    }
  };

  const formatCron = (cron: string) => {
    const preset = CRON_PRESETS.find(p => p.value === cron);
    return preset ? `${preset.label} (${cron})` : cron;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Geplante Aufgaben</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center space-x-2 px-3 py-1.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Neue Aufgabe</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Aufgaben werden geladen...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-8 bg-gray-800 rounded-lg border border-gray-700">
          <Clock className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-3">Keine geplanten Aufgaben vorhanden</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors"
          >
            Erste Aufgabe erstellen
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-gray-800 rounded-lg border border-gray-700 p-3 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white text-sm font-medium">{task.name}</span>
                  <span className="px-2 py-0.5 text-xs rounded bg-hydash-600/20 text-hydash-400">
                    {TASK_TYPES.find(t => t.value === task.taskType)?.label || task.taskType}
                  </span>
                  {task.lastStatus && (
                    <span className={`px-2 py-0.5 text-xs rounded ${getStatusBadge(task.lastStatus)}`}>
                      {getStatusLabel(task.lastStatus)}
                    </span>
                  )}
                  {!task.enabled && (
                    <span className="px-2 py-0.5 text-xs rounded bg-gray-500/20 text-gray-500">
                      Deaktiviert
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-gray-400 flex items-center gap-4 flex-wrap">
                  {task.cronExpression ? (
                    <span className="font-mono">{formatCron(task.cronExpression)}</span>
                  ) : (
                    <span>Einmalige Aufgabe</span>
                  )}
                  {task.lastRunAt && (
                    <span>Letzte Ausführung: {new Date(task.lastRunAt).toLocaleString('de-DE')}</span>
                  )}
                  {task.nextRunAt && task.enabled && (
                    <span>Nächste: {new Date(task.nextRunAt).toLocaleString('de-DE')}</span>
                  )}
                </div>
                {task.command && task.taskType === 'command' && (
                  <p className="text-xs text-gray-500 mt-1 font-mono truncate">
                    $ {task.command}
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-1 ml-3">
                <button
                  onClick={() => toggleMutation.mutate(task.id)}
                  className={`p-1.5 rounded transition-colors ${task.enabled ? 'text-green-400 hover:bg-green-500/10' : 'text-gray-500 hover:bg-gray-700'}`}
                  title={task.enabled ? 'Deaktivieren' : 'Aktivieren'}
                >
                  {task.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => executeMutation.mutate(task.id)}
                  disabled={executeMutation.isPending}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                  title="Jetzt ausführen"
                >
                  <Play className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setConfirmState({open: true, onConfirm: () => deleteMutation.mutate(task.id), title: 'Aufgabe löschen', message: 'Aufgabe wirklich löschen?'}); }}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                  title="Löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold text-white mb-4">Neue geplante Aufgabe</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={newTask.name}
                  onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500"
                  placeholder="z.B. Tägliches Backup"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Typ</label>
                <select
                  value={newTask.taskType}
                  onChange={(e) => setNewTask(prev => ({ ...prev, taskType: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm"
                >
                  {TASK_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Zeitplan <span className="text-gray-500">(leer = einmalig)</span>
                </label>
                <input
                  type="text"
                  value={newTask.cronExpression}
                  onChange={(e) => setNewTask(prev => ({ ...prev, cronExpression: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-hydash-500"
                  placeholder="0 3 * * *"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {CRON_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => setNewTask(prev => ({ ...prev, cronExpression: preset.value }))}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        newTask.cronExpression === preset.value
                          ? 'bg-hydash-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              {newTask.taskType === 'command' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Befehl</label>
                  <input
                    type="text"
                    value={newTask.command}
                    onChange={(e) => setNewTask(prev => ({ ...prev, command: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-hydash-500"
                    placeholder="say Server wird neu gestartet!"
                  />
                </div>
              )}
            </div>
            {createMutation.isError && (
              <p className="text-red-400 text-sm mt-3">
                {createMutation.error instanceof Error ? createMutation.error.message : 'Fehler beim Erstellen'}
              </p>
            )}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleCreate}
                disabled={!newTask.name || createMutation.isPending}
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