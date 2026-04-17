import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: add auth token
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response interceptor: handle 401 with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await useAuthStore.getState().refreshToken();
        const { accessToken } = useAuthStore.getState();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// ============================================
// Auth API
// ============================================
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, displayName?: string) =>
    api.post('/auth/register', { email, password, displayName }),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  me: () => api.get('/auth/me'),
  generateApiKey: () => api.post('/auth/api-key'),
  updateProfile: (data: { displayName: string }) =>
    api.put('/auth/me/profile', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/me/password', { currentPassword, newPassword }),
};

// ============================================
// Servers API
// ============================================
export const serverApi = {
  list: () => api.get('/servers'),
  get: (id: string) => api.get(`/servers/${id}`),
  create: (data: Record<string, unknown>) => api.post('/servers', data),
  update: (id: string, data: Record<string, unknown>) => api.put(`/servers/${id}`, data),
  delete: (id: string) => api.delete(`/servers/${id}`),
  start: (id: string) => api.post(`/servers/${id}/start`),
  stop: (id: string) => api.post(`/servers/${id}/stop`),
  restart: (id: string) => api.post(`/servers/${id}/restart`),
  getConfig: (id: string) => api.get(`/servers/${id}/config`),
  updateConfig: (id: string, data: Record<string, unknown>) => api.put(`/servers/${id}/config`, data),
};

// ============================================
// Mods API
// ============================================
export const modApi = {
  search: (serverId: string, query: string, page?: number) =>
    api.get(`/servers/${serverId}/mods/search`, { params: { q: query, page } }),
  featured: (serverId: string) => api.get(`/servers/${serverId}/mods/featured`),
  installed: (serverId: string) => api.get(`/servers/${serverId}/mods/installed`),
  files: (serverId: string, curseforgeId: number) =>
    api.get(`/servers/${serverId}/mods/${curseforgeId}/files`),
  install: (serverId: string, data: { curseforgeId: number; fileId?: number }) =>
    api.post(`/servers/${serverId}/mods/install`, data),
  uninstall: (serverId: string, modId: string) =>
    api.delete(`/servers/${serverId}/mods/${modId}`),
  update: (serverId: string, modId: string) =>
    api.post(`/servers/${serverId}/mods/${modId}/update`),
};

// ============================================
// Backups API
// ============================================
export const backupApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/backups`),
  create: (serverId: string, type?: string) =>
    api.post(`/servers/${serverId}/backups`, { backupType: type || 'full' }),
  restore: (backupId: string) => api.post(`/backups/${backupId}/restore`),
  delete: (backupId: string) => api.delete(`/backups/${backupId}`),
};

// ============================================
// Monitoring API
// ============================================
export const monitoringApi = {
  current: (serverId: string) => api.get(`/servers/${serverId}/monitoring/current`),
  history: (serverId: string, hours?: number) =>
    api.get(`/servers/${serverId}/monitoring/history`, { params: { hours } }),
  health: (serverId: string) => api.get(`/servers/${serverId}/monitoring/health`),
  logs: (serverId: string, limit?: number) =>
    api.get(`/servers/${serverId}/monitoring/logs`, { params: { limit } }),
  overview: () => api.get('/monitoring/overview'),
};

// ============================================
// Scheduled Tasks API
// ============================================
export const taskApi = {
  list: (serverId: string) => api.get(`/servers/${serverId}/tasks`),
  get: (taskId: string) => api.get(`/tasks/${taskId}`),
  create: (serverId: string, data: Record<string, unknown>) =>
    api.post(`/servers/${serverId}/tasks`, data),
  update: (taskId: string, data: Record<string, unknown>) =>
    api.put(`/tasks/${taskId}`, data),
  delete: (taskId: string) => api.delete(`/tasks/${taskId}`),
  enable: (taskId: string) => api.post(`/tasks/${taskId}/enable`),
  disable: (taskId: string) => api.post(`/tasks/${taskId}/disable`),
  execute: (taskId: string) => api.post(`/tasks/${taskId}/execute`),
  executions: (taskId: string) => api.get(`/tasks/${taskId}/executions`),
  chain: (taskId: string, nextTaskId: string) =>
    api.post(`/tasks/${taskId}/chain/${nextTaskId}`),
};

// ============================================
// Files API
// ============================================
export const fileApi = {
  list: (serverId: string, path?: string) =>
    api.get(`/servers/${serverId}/files`, { params: { path } }),
  read: (serverId: string, path: string) =>
    api.get(`/servers/${serverId}/files/content`, { params: { path } }),
  write: (serverId: string, path: string, content: string) =>
    api.put(`/servers/${serverId}/files/content`, { path, content }),
  delete: (serverId: string, path: string) =>
    api.delete(`/servers/${serverId}/files`, { params: { path } }),
  upload: (serverId: string, file: File, path?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (path) formData.append('path', path);
    return api.post(`/servers/${serverId}/files/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ============================================
// Hytale Integration API
// ============================================
export const hytaleApi = {
  setupStart: (serverId: string) => api.post(`/servers/${serverId}/setup/start`),
  setupStatus: (serverId: string) => api.get(`/servers/${serverId}/setup/status`),
  deviceCode: (serverId: string) => api.post(`/servers/${serverId}/auth/device-code`),
  pollAuth: (serverId: string) => api.post(`/servers/${serverId}/auth/poll`),
  authState: (serverId: string) => api.get(`/servers/${serverId}/auth/state`),
  storeCredentials: (serverId: string, credentials: { accessToken: string; refreshToken: string; expiresAt?: number }) =>
    api.post(`/servers/${serverId}/auth/credentials`, credentials),
  download: (serverId: string) => api.post(`/servers/${serverId}/download`),
  updateCheck: (serverId: string) => api.get(`/servers/${serverId}/update-check`),
};

// ============================================
// Settings API
// ============================================
export const settingsApi = {
  getPublic: () => api.get('/settings'),
  getAdmin: () => api.get('/settings/admin'),
  update: (data: Record<string, unknown>) => api.put('/settings/admin', data),
};

// ============================================
// Admin API
// ============================================
export const adminApi = {
  listUsers: () => api.get('/admin/users'),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  createUser: (data: { email: string; password: string; displayName?: string; roleIds?: string[] }) =>
    api.post('/admin/users', data),
  updateUser: (id: string, data: { displayName?: string; email?: string }) =>
    api.patch(`/admin/users/${id}`, data),
  setUserActive: (id: string, isActive: boolean) =>
    api.patch(`/admin/users/${id}/active`, { isActive }),
  resetPassword: (id: string, password: string) =>
    api.post(`/admin/users/${id}/reset-password`, { password }),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  listRoles: () => api.get('/admin/roles'),
  createRole: (data: Record<string, unknown>) => api.post('/admin/roles', data),
  updateRolePermissions: (id: string, permissionIds: string[]) =>
    api.patch(`/admin/roles/${id}/permissions`, { permissionIds }),
  deleteRole: (id: string) => api.delete(`/admin/roles/${id}`),
  assignRole: (userId: string, roleId: string) =>
    api.post(`/admin/users/${userId}/roles/${roleId}`),
  removeRole: (userId: string, roleId: string) =>
    api.delete(`/admin/users/${userId}/roles/${roleId}`),
  listPermissions: () => api.get('/admin/permissions'),
};

export default api;