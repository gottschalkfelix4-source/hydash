import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, settingsApi, authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Save, Plus, Trash2, Edit3, Key, ToggleLeft, ToggleRight,
  Shield, X, UserPlus, Lock
} from 'lucide-react';
import { Role, Permission } from '../types';
import ConfirmModal from '@/components/ConfirmModal';

type ModalType = 'createUser' | 'editUser' | 'resetPassword' | 'createRole' | 'editRolePermissions' | 'changeOwnPassword' | null;

export default function Settings() {
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [editingSettings, setEditingSettings] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{open: boolean, onConfirm: () => void, title: string, message: string} | null>(null);

  // Form states
  const [createUserForm, setCreateUserForm] = useState({ email: '', password: '', displayName: '', roleIds: [] as string[] });
  const [editUserForm, setEditUserForm] = useState({ displayName: '', email: '' });
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: '' });
  const [createRoleForm, setCreateRoleForm] = useState({ name: '', description: '', permissionIds: [] as string[] });
  const [editRolePermForm, setEditRolePermForm] = useState({ permissionIds: [] as string[] });
  const [changeOwnPasswordForm, setChangeOwnPasswordForm] = useState({ currentPassword: '', newPassword: '' });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.listUsers(),
  });

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => adminApi.listRoles(),
  });

  const { data: permissionsData } = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: () => adminApi.listPermissions(),
    enabled: modal === 'createRole' || modal === 'editRolePermissions',
  });

  const { data: settingsData } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => settingsApi.getAdmin(),
  });

  const users = usersData?.data?.data || [];
  const roles: Role[] = rolesData?.data?.data || [];
  const permissions: Permission[] = permissionsData?.data?.data || [];
  const settings = settingsData?.data?.data;

  // Group permissions by groupName
  const permissionsByGroup = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    if (!acc[p.groupName]) acc[p.groupName] = [];
    acc[p.groupName].push(p);
    return acc;
  }, {});

  // Mutations
  const updateSettingsMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => settingsApi.update(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-settings'] }); setEditingSettings(false); },
  });

  const createUserMutation = useMutation({
    mutationFn: (data: { email: string; password: string; displayName?: string; roleIds?: string[] }) => adminApi.createUser(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); closeModal(); },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { displayName?: string; email?: string } }) => adminApi.updateUser(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); closeModal(); },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => adminApi.resetPassword(id, password),
    onSuccess: () => closeModal(),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminApi.setUserActive(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => adminApi.assignRole(userId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const removeRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => adminApi.removeRole(userId, roleId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const createRoleMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => adminApi.createRole(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-roles'] }); closeModal(); },
  });

  const updateRolePermsMutation = useMutation({
    mutationFn: ({ id, permissionIds }: { id: string; permissionIds: string[] }) => adminApi.updateRolePermissions(id, permissionIds),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-roles'] }); closeModal(); },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteRole(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-roles'] }),
  });

  const changeOwnPasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => closeModal(),
  });

  const closeModal = () => {
    setModal(null);
    setSelectedUserId(null);
    setSelectedRoleId(null);
    setCreateUserForm({ email: '', password: '', displayName: '', roleIds: [] });
    setEditUserForm({ displayName: '', email: '' });
    setResetPasswordForm({ password: '' });
    setCreateRoleForm({ name: '', description: '', permissionIds: [] });
    setEditRolePermForm({ permissionIds: [] });
    setChangeOwnPasswordForm({ currentPassword: '', newPassword: '' });
  };

  const openEditUser = (u: { id: string; displayName: string | null; email: string }) => {
    setSelectedUserId(u.id);
    setEditUserForm({ displayName: u.displayName || '', email: u.email });
    setModal('editUser');
  };

  const openResetPassword = (id: string) => {
    setSelectedUserId(id);
    setResetPasswordForm({ password: '' });
    setModal('resetPassword');
  };

  const openEditRolePerms = (role: Role) => {
    setSelectedRoleId(role.id);
    setEditRolePermForm({ permissionIds: role.permissions?.map(p => p.id) || [] });
    setModal('editRolePermissions');
  };

  const togglePermission = (permId: string, target: 'createRole' | 'editRolePermissions') => {
    if (target === 'createRole') {
      const current = createRoleForm.permissionIds;
      setCreateRoleForm({
        ...createRoleForm,
        permissionIds: current.includes(permId)
          ? current.filter(id => id !== permId)
          : [...current, permId],
      });
    } else {
      const current = editRolePermForm.permissionIds;
      setEditRolePermForm({
        permissionIds: current.includes(permId)
          ? current.filter(id => id !== permId)
          : [...current, permId],
      });
    }
  };

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

  const renderPermissionCheckboxes = (target: 'createRole' | 'editRolePermissions') => {
    const form = target === 'createRole' ? createRoleForm : editRolePermForm;
    return Object.entries(permissionsByGroup).map(([group, perms]) => (
      <div key={group} className="mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5">{group}</p>
        <div className="flex flex-wrap gap-2">
          {perms.map(p => {
            const checked = form.permissionIds.includes(p.id);
            return (
              <label
                key={p.id}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                  checked ? 'bg-hydash-600/20 text-hydash-400 border border-hydash-500/40' : 'bg-gray-700 text-gray-400 border border-gray-600 hover:border-gray-500'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePermission(p.id, target)}
                  className="sr-only"
                />
                {p.name}
              </label>
            );
          })}
        </div>
      </div>
    ));
  };

  const renderModal = () => {
    if (!modal) return null;

    let title = '';
    let content: React.ReactNode = null;

    switch (modal) {
      case 'createUser':
        title = 'Benutzer hinzufügen';
        content = (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">E-Mail *</label>
              <input type="email" value={createUserForm.email} onChange={e => setCreateUserForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" placeholder="user@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Anzeigename</label>
              <input type="text" value={createUserForm.displayName} onChange={e => setCreateUserForm(f => ({ ...f, displayName: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" placeholder="Max Mustermann" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Passwort * <span className="text-gray-500">(min. 8 Zeichen)</span></label>
              <input type="password" value={createUserForm.password} onChange={e => setCreateUserForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Rollen</label>
              <div className="flex flex-wrap gap-2">
                {roles.map(role => {
                  const checked = createUserForm.roleIds.includes(role.id);
                  return (
                    <button key={role.id} type="button" onClick={() => setCreateUserForm(f => ({
                      ...f,
                      roleIds: checked ? f.roleIds.filter(id => id !== role.id) : [...f.roleIds, role.id],
                    }))}
                      className={`px-2 py-1 text-xs rounded transition-colors ${checked ? 'bg-hydash-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}>
                      {role.name}
                    </button>
                  );
                })}
              </div>
            </div>
            {createUserMutation.isError && (
              <p className="text-red-400 text-sm">{createUserMutation.error instanceof Error ? createUserMutation.error.message : 'Fehler beim Erstellen'}</p>
            )}
            <div className="flex space-x-3 pt-2">
              <button onClick={() => createUserMutation.mutate(createUserForm)} disabled={!createUserForm.email || !createUserForm.password || createUserMutation.isPending}
                className="flex-1 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
                {createUserMutation.isPending ? 'Erstelle...' : 'Erstellen'}
              </button>
              <button onClick={closeModal} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        );
        break;

      case 'editUser': {
        const editUser = users.find((u: { id: string }) => u.id === selectedUserId);
        title = editUser ? `${editUser.email} bearbeiten` : 'Benutzer bearbeiten';
        content = (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Anzeigename</label>
              <input type="text" value={editUserForm.displayName} onChange={e => setEditUserForm(f => ({ ...f, displayName: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">E-Mail</label>
              <input type="email" value={editUserForm.email} onChange={e => setEditUserForm(f => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
            </div>
            {updateUserMutation.isError && (
              <p className="text-red-400 text-sm">{updateUserMutation.error instanceof Error ? updateUserMutation.error.message : 'Fehler'}</p>
            )}
            <div className="flex space-x-3 pt-2">
              <button onClick={() => selectedUserId && updateUserMutation.mutate({ id: selectedUserId, data: editUserForm })}
                disabled={updateUserMutation.isPending}
                className="flex-1 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
                {updateUserMutation.isPending ? 'Speichere...' : 'Speichern'}
              </button>
              <button onClick={closeModal} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        );
        break;
      }

      case 'resetPassword':
        title = 'Passwort zurücksetzen';
        content = (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Neues Passwort für diesen Benutzer festlegen.</p>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Neues Passwort <span className="text-gray-500">(min. 8 Zeichen)</span></label>
              <input type="password" value={resetPasswordForm.password} onChange={e => setResetPasswordForm(f => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
            </div>
            {resetPasswordMutation.isError && (
              <p className="text-red-400 text-sm">{resetPasswordMutation.error instanceof Error ? resetPasswordMutation.error.message : 'Fehler'}</p>
            )}
            <div className="flex space-x-3 pt-2">
              <button onClick={() => selectedUserId && resetPasswordMutation.mutate({ id: selectedUserId, password: resetPasswordForm.password })}
                disabled={!resetPasswordForm.password || resetPasswordForm.password.length < 8 || resetPasswordMutation.isPending}
                className="flex-1 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
                {resetPasswordMutation.isPending ? 'Zurücksetzen...' : 'Passwort setzen'}
              </button>
              <button onClick={closeModal} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        );
        break;

      case 'createRole':
        title = 'Rolle erstellen';
        content = (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
              <input type="text" value={createRoleForm.name} onChange={e => setCreateRoleForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" placeholder="z.B. moderator" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Beschreibung</label>
              <input type="text" value={createRoleForm.description} onChange={e => setCreateRoleForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Berechtigungen</label>
              {renderPermissionCheckboxes('createRole')}
            </div>
            {createRoleMutation.isError && (
              <p className="text-red-400 text-sm">{createRoleMutation.error instanceof Error ? createRoleMutation.error.message : 'Fehler'}</p>
            )}
            <div className="flex space-x-3 pt-2">
              <button onClick={() => createRoleMutation.mutate({ name: createRoleForm.name, description: createRoleForm.description || undefined, permissionIds: createRoleForm.permissionIds })}
                disabled={!createRoleForm.name || createRoleMutation.isPending}
                className="flex-1 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
                {createRoleMutation.isPending ? 'Erstelle...' : 'Erstellen'}
              </button>
              <button onClick={closeModal} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        );
        break;

      case 'editRolePermissions': {
        const editRole = roles.find(r => r.id === selectedRoleId);
        title = editRole ? `Berechtigungen: ${editRole.name}` : 'Berechtigungen bearbeiten';
        content = (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Berechtigungen</label>
              {renderPermissionCheckboxes('editRolePermissions')}
            </div>
            {updateRolePermsMutation.isError && (
              <p className="text-red-400 text-sm">{updateRolePermsMutation.error instanceof Error ? updateRolePermsMutation.error.message : 'Fehler'}</p>
            )}
            <div className="flex space-x-3 pt-2">
              <button onClick={() => selectedRoleId && updateRolePermsMutation.mutate({ id: selectedRoleId, permissionIds: editRolePermForm.permissionIds })}
                disabled={updateRolePermsMutation.isPending}
                className="flex-1 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
                {updateRolePermsMutation.isPending ? 'Speichere...' : 'Speichern'}
              </button>
              <button onClick={closeModal} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        );
        break;
      }

      case 'changeOwnPassword':
        title = 'Eigenes Passwort ändern';
        content = (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Aktuelles Passwort</label>
              <input type="password" value={changeOwnPasswordForm.currentPassword} onChange={e => setChangeOwnPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Neues Passwort <span className="text-gray-500">(min. 8 Zeichen)</span></label>
              <input type="password" value={changeOwnPasswordForm.newPassword} onChange={e => setChangeOwnPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
            </div>
            {changeOwnPasswordMutation.isError && (
              <p className="text-red-400 text-sm">{changeOwnPasswordMutation.error instanceof Error ? changeOwnPasswordMutation.error.message : 'Fehler'}</p>
            )}
            <div className="flex space-x-3 pt-2">
              <button onClick={() => changeOwnPasswordMutation.mutate(changeOwnPasswordForm)}
                disabled={!changeOwnPasswordForm.currentPassword || changeOwnPasswordForm.newPassword.length < 8 || changeOwnPasswordMutation.isPending}
                className="flex-1 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
                {changeOwnPasswordMutation.isPending ? 'Ändere...' : 'Passwort ändern'}
              </button>
              <button onClick={closeModal} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Abbrechen</button>
            </div>
          </div>
        );
        break;
    }

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <button onClick={closeModal} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
          {content}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Einstellungen</h1>

      {/* Own Account */}
      {user && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Mein Konto</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
            <dt className="text-gray-400">E-Mail</dt><dd className="text-gray-200">{user.email}</dd>
            <dt className="text-gray-400">Name</dt><dd className="text-gray-200">{user.displayName || '-'}</dd>
            <dt className="text-gray-400">Rollen</dt>
            <dd className="text-gray-200">
              <div className="flex flex-wrap gap-1">
                {user.roles.map(role => (
                  <span key={role} className="px-2 py-0.5 text-xs rounded bg-hydash-600/20 text-hydash-400">{role}</span>
                ))}
              </div>
            </dd>
          </dl>
          <button onClick={() => { setChangeOwnPasswordForm({ currentPassword: '', newPassword: '' }); setModal('changeOwnPassword'); }}
            className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
            <Lock className="w-4 h-4" />
            <span>Passwort ändern</span>
          </button>
        </div>
      )}

      {/* Panel Settings */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Panel-Einstellungen</h2>
          {!editingSettings && settings && (
            <button onClick={startEditing} className="px-3 py-1.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded text-sm transition-colors">Bearbeiten</button>
          )}
        </div>
        {settings ? (
          editingSettings ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Panel-Name</label>
                <input type="text" value={String(editForm.panelName || '')} onChange={e => setEditForm(prev => ({ ...prev, panelName: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Beschreibung</label>
                <textarea value={String(editForm.panelDescription || '')} onChange={e => setEditForm(prev => ({ ...prev, panelDescription: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500 resize-none" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Metriken-Refresh (Sek.)</label>
                  <input type="number" value={Number(editForm.metricsRefreshIntervalSeconds || 30)} onChange={e => setEditForm(prev => ({ ...prev, metricsRefreshIntervalSeconds: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Backup-Aufbewahrung (Tage)</label>
                  <input type="number" value={Number(editForm.backupRetentionDays || 30)} onChange={e => setEditForm(prev => ({ ...prev, backupRetentionDays: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Max. Server/User</label>
                  <input type="number" value={Number(editForm.maxServersPerUser || 3)} onChange={e => setEditForm(prev => ({ ...prev, maxServersPerUser: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Standard-RAM (MB)</label>
                  <input type="number" value={Number(editForm.defaultMemoryLimitMb || 6144)} onChange={e => setEditForm(prev => ({ ...prev, defaultMemoryLimitMb: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Standard-Sichtweite</label>
                <input type="number" min={4} max={32} value={Number(editForm.defaultViewDistance || 12)} onChange={e => setEditForm(prev => ({ ...prev, defaultViewDistance: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-hydash-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">CurseForge API-Key</label>
                <input type="password" value={String(editForm.curseforgeApiKey || '')} onChange={e => setEditForm(prev => ({ ...prev, curseforgeApiKey: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-hydash-500" />
                <p className="text-xs text-gray-500 mt-1">
                  API-Key von <a href="https://console.curseforge.com" target="_blank" rel="noopener noreferrer" className="text-hydash-400 hover:underline">console.curseforge.com</a>
                </p>
              </div>
              <div className="flex space-x-3 pt-2">
                <button onClick={() => updateSettingsMutation.mutate(editForm)} disabled={updateSettingsMutation.isPending}
                  className="flex items-center space-x-2 px-4 py-2 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
                  <Save className="w-4 h-4" />
                  <span>{updateSettingsMutation.isPending ? 'Speichere...' : 'Speichern'}</span>
                </button>
                <button onClick={() => setEditingSettings(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">Abbrechen</button>
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
              <dd className="text-gray-200">{settings.curseforgeApiKey ? <span className="text-green-400">Gespeichert</span> : <span className="text-yellow-400">Nicht gesetzt</span>}</dd>
            </dl>
          )
        ) : (
          <p className="text-gray-400">Einstellungen werden geladen...</p>
        )}
      </div>

      {/* Users */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Benutzer</h2>
          <button onClick={() => setModal('createUser')} className="flex items-center space-x-2 px-3 py-1.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors">
            <UserPlus className="w-4 h-4" />
            <span>Hinzufügen</span>
          </button>
        </div>
        {usersLoading ? (
          <p className="text-gray-400">Benutzer werden geladen...</p>
        ) : users.length === 0 ? (
          <p className="text-gray-500 text-sm">Keine Benutzer vorhanden</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 text-gray-400 font-medium">E-Mail</th>
                  <th className="text-left py-2 text-gray-400 font-medium">Name</th>
                  <th className="text-left py-2 text-gray-400 font-medium">Rollen</th>
                  <th className="text-left py-2 text-gray-400 font-medium">Status</th>
                  <th className="text-right py-2 text-gray-400 font-medium">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: { id: string; email: string; displayName: string | null; roles: string[]; isActive: boolean }) => (
                  <tr key={u.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                    <td className="py-3 text-gray-200">{u.email}</td>
                    <td className="py-3 text-gray-200">{u.displayName || '-'}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1 items-center">
                        {u.roles?.map((role: string) => {
                          const roleObj = roles.find((r: Role) => r.name === role);
                          return (
                            <span key={role} className="px-2 py-0.5 text-xs rounded bg-hydash-600/20 text-hydash-400 inline-flex items-center gap-1">
                              {role}
                              {roleObj && u.id !== user?.id && (
                                <button onClick={() => removeRoleMutation.mutate({ userId: u.id, roleId: roleObj.id })}
                                  className="hover:text-red-400 transition-colors ml-0.5" title="Rolle entfernen">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          );
                        })}
                        {/* Add role dropdown */}
                        {u.id !== user?.id && (
                          <div className="relative">
                            <button onClick={() => setRoleDropdownOpen(roleDropdownOpen === u.id ? null : u.id)}
                              className="px-1.5 py-0.5 text-xs rounded bg-gray-700 text-gray-500 hover:text-white transition-colors">
                              <Plus className="w-3 h-3" />
                            </button>
                            {roleDropdownOpen === u.id && (
                              <div className="absolute left-0 top-6 bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-10 py-1 min-w-[120px]">
                                {roles.filter((r: Role) => !u.roles?.includes(r.name)).map((r: Role) => (
                                  <button key={r.id} onClick={() => { assignRoleMutation.mutate({ userId: u.id, roleId: r.id }); setRoleDropdownOpen(null); }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600 hover:text-white transition-colors">
                                    + {r.name}
                                  </button>
                                ))}
                                {roles.filter((r: Role) => !u.roles?.includes(r.name)).length === 0 && (
                                  <span className="block px-3 py-1.5 text-xs text-gray-500">Alle zugewiesen</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <button onClick={() => u.id !== user?.id && toggleActiveMutation.mutate({ id: u.id, isActive: !u.isActive })}
                        disabled={u.id === user?.id}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded transition-colors ${
                          u.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        } ${u.id === user?.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        {u.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                        {u.isActive ? 'Aktiv' : 'Deaktiviert'}
                      </button>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end space-x-1">
                        <button onClick={() => openEditUser(u)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="Bearbeiten">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => openResetPassword(u.id)} className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors" title="Passwort zurücksetzen">
                          <Key className="w-4 h-4" />
                        </button>
                        {u.id !== user?.id && (
                          <button onClick={() => { setConfirmState({open: true, onConfirm: () => deleteUserMutation.mutate(u.id), title: 'Benutzer löschen', message: `Benutzer "${u.email}" wirklich löschen?`}); }}
                            disabled={deleteUserMutation.isPending}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50" title="Löschen">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Rollen</h2>
          <button onClick={() => setModal('createRole')} className="flex items-center space-x-2 px-3 py-1.5 bg-hydash-600 hover:bg-hydash-700 text-white rounded-lg text-sm transition-colors">
            <Plus className="w-4 h-4" />
            <span>Rolle erstellen</span>
          </button>
        </div>
        {rolesLoading ? (
          <p className="text-gray-400">Rollen werden geladen...</p>
        ) : (
          <div className="space-y-3">
            {roles.map((role: Role) => (
              <div key={role.id} className="border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-hydash-400" />
                    <span className="font-medium text-white">{role.name}</span>
                    {role.isSystem && (
                      <span className="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">System</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    <button onClick={() => openEditRolePerms(role)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="Berechtigungen bearbeiten">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {!role.isSystem && (
                      <button onClick={() => { setConfirmState({open: true, onConfirm: () => deleteRoleMutation.mutate(role.id), title: 'Rolle löschen', message: `Rolle "${role.name}" wirklich löschen?`}); }}
                        disabled={deleteRoleMutation.isPending}
                        className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50" title="Löschen">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                {role.description && <p className="text-sm text-gray-400 mt-1 ml-6">{role.description}</p>}
                <div className="flex flex-wrap gap-1 mt-2 ml-6">
                  {role.permissions?.map((p: Permission) => (
                    <span key={p.id} className="px-1.5 py-0.5 text-xs rounded bg-gray-700 text-gray-300">
                      {p.name}
                    </span>
                  ))}
                  {(!role.permissions || role.permissions.length === 0) && (
                    <span className="text-xs text-gray-500">Keine Berechtigungen</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {renderModal()}

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