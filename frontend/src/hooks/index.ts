import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serverApi, monitoringApi, backupApi, modApi, taskApi, hytaleApi, fileApi } from '@/services/api';

// ============================================
// Server Hooks
// ============================================

export function useServers() {
  return useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const res = await serverApi.list();
      return res.data?.data || [];
    },
    refetchInterval: 10000,
  });
}

export function useServer(serverId: string) {
  return useQuery({
    queryKey: ['server', serverId],
    queryFn: async () => {
      const res = await serverApi.get(serverId);
      return res.data?.data;
    },
    enabled: !!serverId,
  });
}

export function useServerStart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => serverApi.start(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring-overview'] });
    },
  });
}

export function useServerStop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => serverApi.stop(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring-overview'] });
    },
  });
}

export function useServerRestart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => serverApi.restart(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring-overview'] });
    },
  });
}

export function useServerDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => serverApi.delete(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['monitoring-overview'] });
    },
  });
}

export function useServerLifecycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serverId, action }: { serverId: string; action: 'start' | 'stop' | 'restart' }) => {
      switch (action) {
        case 'start': return serverApi.start(serverId);
        case 'stop': return serverApi.stop(serverId);
        case 'restart': return serverApi.restart(serverId);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['servers'] }),
  });
}

// ============================================
// Metrics Hooks
// ============================================

export function useCurrentMetrics(serverId: string) {
  return useQuery({
    queryKey: ['metrics', serverId],
    queryFn: async () => {
      const res = await monitoringApi.current(serverId);
      return res.data?.data;
    },
    enabled: !!serverId,
    refetchInterval: 5000,
  });
}

export function useMetricsHistory(serverId: string, hours: number = 24) {
  return useQuery({
    queryKey: ['metrics-history', serverId, hours],
    queryFn: async () => {
      const res = await monitoringApi.history(serverId, hours);
      return res.data?.data || [];
    },
    enabled: !!serverId,
  });
}

export function useHealthAnalysis(serverId: string) {
  return useQuery({
    queryKey: ['health', serverId],
    queryFn: async () => {
      const res = await monitoringApi.health(serverId);
      return res.data?.data;
    },
    enabled: !!serverId,
    refetchInterval: 30000,
  });
}

export function useMonitoringOverview() {
  return useQuery({
    queryKey: ['monitoring-overview'],
    queryFn: async () => {
      const res = await monitoringApi.overview();
      return res.data?.data;
    },
    refetchInterval: 30000,
  });
}

export function useSystemInfo() {
  return useQuery({
    queryKey: ['monitoring-system'],
    queryFn: async () => {
      const res = await monitoringApi.system();
      return res.data?.data;
    },
    refetchInterval: 10000,
  });
}

// ============================================
// Backup Hooks
// ============================================

export function useBackups(serverId: string) {
  return useQuery({
    queryKey: ['backups', serverId],
    queryFn: async () => {
      const res = await backupApi.list(serverId);
      return res.data?.data || [];
    },
    enabled: !!serverId,
  });
}

export function useCreateBackup(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type?: string) => backupApi.create(serverId, type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups', serverId] }),
  });
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (backupId: string) => backupApi.restore(backupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  });
}

export function useDeleteBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (backupId: string) => backupApi.delete(backupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['backups'] }),
  });
}

// ============================================
// Mod Hooks
// ============================================

export function useInstalledMods(serverId: string) {
  return useQuery({
    queryKey: ['mods', serverId],
    queryFn: async () => {
      const res = await modApi.installed(serverId);
      return res.data?.data || [];
    },
    enabled: !!serverId,
  });
}

export function useSearchMods(serverId: string, query: string) {
  return useQuery({
    queryKey: ['mod-search', serverId, query],
    queryFn: async () => {
      if (!query) return [];
      const res = await modApi.search(serverId, query);
      return res.data?.data?.mods || [];
    },
    enabled: !!serverId && !!query,
  });
}

export function useInstallMod(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { curseforgeId: number; fileId?: number }) => modApi.install(serverId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mods', serverId] }),
  });
}

export function useUninstallMod(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (modId: string) => modApi.uninstall(serverId, modId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mods', serverId] }),
  });
}

export function useUpdateMod(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (modId: string) => modApi.update(serverId, modId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mods', serverId] }),
  });
}

// ============================================
// Scheduled Task Hooks
// ============================================

export function useScheduledTasks(serverId: string) {
  return useQuery({
    queryKey: ['tasks', serverId],
    queryFn: async () => {
      const res = await taskApi.list(serverId);
      return res.data?.data || [];
    },
    enabled: !!serverId,
  });
}

export function useTaskExecutions(taskId: string) {
  return useQuery({
    queryKey: ['task-executions', taskId],
    queryFn: async () => {
      const res = await taskApi.executions(taskId);
      return res.data?.data || [];
    },
    enabled: !!taskId,
  });
}

export function useCreateTask(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => taskApi.create(serverId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks', serverId] }),
  });
}

export function useExecuteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => taskApi.execute(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => taskApi.delete(taskId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useToggleTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, enabled }: { taskId: string; enabled: boolean }) => {
      return enabled ? taskApi.enable(taskId) : taskApi.disable(taskId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

// ============================================
// File Hooks
// ============================================

export function useFileList(serverId: string, path?: string) {
  return useQuery({
    queryKey: ['files', serverId, path],
    queryFn: async () => {
      const res = await fileApi.list(serverId, path);
      return res.data?.data || [];
    },
    enabled: !!serverId,
  });
}

export function useFileContent(serverId: string, path: string) {
  return useQuery({
    queryKey: ['file-content', serverId, path],
    queryFn: async () => {
      const res = await fileApi.read(serverId, path);
      return res.data?.data;
    },
    enabled: !!serverId && !!path,
  });
}

export function useFileWrite(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => fileApi.write(serverId, path, content),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['files', serverId] }),
  });
}

export function useFileDelete(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => fileApi.delete(serverId, path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['files', serverId] }),
  });
}

export function useFileUpload(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, path }: { file: File; path?: string }) => fileApi.upload(serverId, file, path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['files', serverId] }),
  });
}

// ============================================
// Hytale Hooks
// ============================================

export function useSetupStatus(serverId: string) {
  return useQuery({
    queryKey: ['setup-status', serverId],
    queryFn: async () => {
      const res = await hytaleApi.setupStatus(serverId);
      return res.data?.data;
    },
    enabled: !!serverId,
    refetchInterval: 2000,
  });
}

export function useStartSetup() {
  return useMutation({
    mutationFn: (serverId: string) => hytaleApi.setupStart(serverId),
  });
}