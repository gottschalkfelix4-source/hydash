import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, settingsApi } from '../services/api';
import { Save } from 'lucide-react';

export default function Settings() {
  const queryClient = useQueryClient();
  const [editingSettings, setEditingSettings] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers(),
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => adminApi.listRoles(),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => settingsApi.getAdmin(),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      setEditingSettings(false);
    },
  });

  const users = usersData?.data?.data || [];
  const roles = rolesData?.data?.data || [];
  const settings = settingsData?.data?.data;

  const startEditing = () => {
    if (settings) {
      setEditForm({
        panelName: settings.panelName || '',
        panelDescription: settings.panelDescription || '',
        metricsRefreshIntervalSeconds: settings.metricsRefreshIntervalSeconds || 30,
        backupRetentionDays: settings.backupRetentionDays || 30,
        maxServersPerUser: settings.maxServersPerUser || 3,
        defaultMemoryLimitMb: settings.defaultMemoryLimitMb || 6144,
        defaultViewDistance: settings.defaultViewDistance || 12,
        curseforgeApiKey: settings.curseforgeApiKey || '',
      });
      setEditingSettings(true);
    }
  };

  const handleSave = () => {
    updateSettingsMutation.mutate(editForm);
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Einstellungen</h1>

      {/* Panel Settings */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Panel-Einstellungen</h2>
          {!editingSettings && settings && (
            <button
              onClick={startEditing}
              className="px-3 py-1.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded text-sm transition-colors"
            >
              Bearbeiten
            </button>
          )}
        </div>
        {settings ? (
          editingSettings ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Panel-Name</label>
                <input
                  type="text"
                  value={String(editForm.panelName || '')}
                  onChange={(e) => setEditForm(prev => ({ ...prev, panelName: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Beschreibung</label>
                <textarea
                  value={String(editForm.panelDescription || '')}
                  onChange={(e) => setEditForm(prev => ({ ...prev, panelDescription: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500 resize-none"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Metriken-Refresh (Sek.)</label>
                  <input
                    type="number"
                    value={Number(editForm.metricsRefreshIntervalSeconds || 30)}
                    onChange={(e) => setEditForm(prev => ({ ...prev, metricsRefreshIntervalSeconds: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Backup-Aufbewahrung (Tage)</label>
                  <input
                    type="number"
                    value={Number(editForm.backupRetentionDays || 30)}
                    onChange={(e) => setEditForm(prev => ({ ...prev, backupRetentionDays: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Max. Server/User</label>
                  <input
                    type="number"
                    value={Number(editForm.maxServersPerUser || 3)}
                    onChange={(e) => setEditForm(prev => ({ ...prev, maxServersPerUser: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Standard-RAM (MB)</label>
                  <input
                    type="number"
                    value={Number(editForm.defaultMemoryLimitMb || 6144)}
                    onChange={(e) => setEditForm(prev => ({ ...prev, defaultMemoryLimitMb: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Standard-Sichtweite</label>
                <input
                  type="number"
                  min={4}
                  max={32}
                  value={Number(editForm.defaultViewDistance || 12)}
                  onChange={(e) => setEditForm(prev => ({ ...prev, defaultViewDistance: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">CurseForge API-Key</label>
                <input
                  type="password"
                  value={String(editForm.curseforgeApiKey || '')}
                  onChange={(e) => setEditForm(prev => ({ ...prev, curseforgeApiKey: e.target.value }))}
                  placeholder="$2a$10$..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-hydash-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  API-Key von <a href="https://console.curseforge.com" target="_blank" rel="noopener noreferrer" className="text-hydash-400 hover:underline">console.curseforge.com</a> benötigt für Mod-Suche.
                </p>
              </div>
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={updateSettingsMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{updateSettingsMutation.isPending ? 'Speichere...' : 'Speichern'}</span>
                </button>
                <button
                  onClick={() => setEditingSettings(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-gray-400">Name</dt><dd className="text-gray-200">{settings.panelName}</dd>
              <dt className="text-gray-400">Beschreibung</dt><dd className="text-gray-200">{settings.panelDescription || '-'}</dd>
              <dt className="text-gray-400">Metriken-Refresh</dt><dd className="text-gray-200">{settings.metricsRefreshIntervalSeconds}s</dd>
              <dt className="text-gray-400">Backup-Aufbewahrung</dt><dd className="text-gray-200">{settings.backupRetentionDays} Tage</dd>
              <dt className="text-gray-400">Max. Server/User</dt><dd className="text-gray-200">{settings.maxServersPerUser}</dd>
              <dt className="text-gray-400">Standard-RAM</dt><dd className="text-gray-200">{settings.defaultMemoryLimitMb / 1024} GB</dd>
              <dt className="text-gray-400">Standard-Sichtweite</dt><dd className="text-gray-200">{settings.defaultViewDistance}</dd>
              <dt className="text-gray-400">CurseForge API-Key</dt>
              <dd className="text-gray-200">
                {settings.curseforgeApiKey ? (
                  <span className="text-green-400">Gespeichert</span>
                ) : (
                  <span className="text-yellow-400">Nicht gesetzt</span>
                )}
              </dd>
            </dl>
          )
        ) : (
          <p className="text-gray-400">Einstellungen werden geladen...</p>
        )}
      </div>

      {/* Users */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Benutzer</h2>
        {usersLoading ? (
          <p className="text-gray-400">Benutzer werden geladen...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 text-gray-400">E-Mail</th>
                  <th className="text-left py-2 text-gray-400">Name</th>
                  <th className="text-left py-2 text-gray-400">Rollen</th>
                  <th className="text-left py-2 text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user: { id: string; email: string; displayName: string | null; roles: string[]; isActive: boolean }) => (
                  <tr key={user.id || user.email} className="border-b border-gray-700/50">
                    <td className="py-2 text-gray-200">{user.email}</td>
                    <td className="py-2 text-gray-200">{user.displayName || '-'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {user.roles?.map((role: string) => (
                          <span key={role} className="px-2 py-0.5 text-xs rounded bg-hydash-600/20 text-hydash-400">
                            {role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        user.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {user.isActive ? 'Aktiv' : 'Deaktiviert'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Roles */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Rollen</h2>
        {rolesLoading ? (
          <p className="text-gray-400">Rollen werden geladen...</p>
        ) : (
          <div className="space-y-3">
            {roles.map((role: { name: string; isSystem: boolean; description: string | null; permissions: { name: string }[] }) => (
              <div key={role.name} className="border border-gray-700 rounded p-3">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-white">{role.name}</span>
                  {role.isSystem && (
                    <span className="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">System</span>
                  )}
                </div>
                {role.description && <p className="text-sm text-gray-400 mt-1">{role.description}</p>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {role.permissions?.map((p: { name: string }) => (
                    <span key={p.name} className="px-1.5 py-0.5 text-xs rounded bg-gray-700 text-gray-300">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}