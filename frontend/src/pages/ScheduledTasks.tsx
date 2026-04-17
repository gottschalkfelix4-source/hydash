import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '../services/api';
import { Plus, Play, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

interface Task {
  id: string;
  serverId: string;
  name: string;
  taskType: string;
  cronExpression: string | null;
  command: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  nextRunAt: string | null;
}

const TASK_TYPES = [
  { value: 'restart', label: 'Server Neustart' },
  { value: 'backup', label: 'Backup erstellen' },
  { value: 'command', label: 'Befehl ausführen' },
  { value: 'start', label: 'Server starten' },
  { value: 'stop', label: 'Server stoppen' },
  { value: 'mod_update', label: 'Mod aktualisieren' },
];

export default function ScheduledTasks() {
  const { id: serverId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({
    name: '',
    taskType: 'restart',
    cronExpression: '',
    command: '',
  });

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', serverId],
    queryFn: () => taskApi.list(serverId!),
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
    mutationFn: (data: Record<string, unknown>) => taskApi.create(serverId!, data),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Geplante Aufgaben</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Neue Aufgabe</span>
        </button>
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-12">Aufgaben werden geladen...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
          <p className="text-gray-400 mb-4">Keine geplanten Aufgaben vorhanden</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg transition-colors"
          >
            Erste Aufgabe erstellen
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-gray-800 rounded-lg border border-gray-700 p-4 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <h3 className="text-white font-medium">{task.name}</h3>
                  <span className="px-2 py-0.5 text-xs rounded bg-hydash-600/20 text-hydash-400">
                    {TASK_TYPES.find(t => t.value === task.taskType)?.label || task.taskType}
                  </span>
                  {task.lastStatus && (
                    <span className={`px-2 py-0.5 text-xs rounded ${getStatusBadge(task.lastStatus)}`}>
                      {task.lastStatus}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-gray-400">
                  {task.cronExpression ? (
                    <span>Cron: <code className="text-gray-300">{task.cronExpression}</code></span>
                  ) : (
                    <span>Einmalige Aufgabe</span>
                  )}
                  {task.lastRunAt && (
                    <span className="ml-4">Letzte Ausführung: {new Date(task.lastRunAt).toLocaleString('de-DE')}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => toggleMutation.mutate(task.id)}
                  className={`p-2 rounded transition-colors ${task.enabled ? 'text-green-400 hover:bg-green-500/10' : 'text-gray-500 hover:bg-gray-700'}`}
                  title={task.enabled ? 'Deaktivieren' : 'Aktivieren'}
                >
                  {task.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => executeMutation.mutate(task.id)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                  title="Jetzt ausführen"
                >
                  <Play className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteMutation.mutate(task.id)}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
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
            <h2 className="text-xl font-semibold text-white mb-4">Neue geplante Aufgabe</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={newTask.name}
                  onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  placeholder="z.B. Tägliches Backup"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Typ</label>
                <select
                  value={newTask.taskType}
                  onChange={(e) => setNewTask(prev => ({ ...prev, taskType: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                >
                  {TASK_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Cron-Ausdruck <span className="text-gray-500">(leer = einmalig)</span>
                </label>
                <input
                  type="text"
                  value={newTask.cronExpression}
                  onChange={(e) => setNewTask(prev => ({ ...prev, cronExpression: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                  placeholder="0 3 * * * (täglich 3:00 Uhr)"
                />
              </div>
              {newTask.taskType === 'command' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Befehl</label>
                  <input
                    type="text"
                    value={newTask.command}
                    onChange={(e) => setNewTask(prev => ({ ...prev, command: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    placeholder="say Server wird neu gestartet!"
                  />
                </div>
              )}
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={handleCreate}
                disabled={!newTask.name || createMutation.isPending}
                className="flex-1 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {createMutation.isPending ? 'Erstelle...' : 'Erstellen'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}