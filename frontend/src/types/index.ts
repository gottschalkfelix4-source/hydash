// Frontend TypeScript type definitions mirroring backend types

export type ServerStatus = 'creating' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
  permissions: string[];
}

export interface Server {
  id: string;
  name: string;
  ownerId: string | null;
  port: number;
  memoryLimitMb: number;
  cpuQuotaMicro: number;
  viewDistance: number;
  status: ServerStatus;
  containerId: string | null;
  tags: string[];
  autostart: boolean;
  config: Record<string, unknown>;
  jvmArgs: string;
  serverArgs: string;
  createdAt: string;
  updatedAt: string;
}

export interface Mod {
  id: string;
  serverId: string;
  curseforgeId: number | null;
  modSlug: string | null;
  fileName: string;
  fileVersion: string | null;
  fileType: 'release' | 'beta' | 'alpha';
  fileSizeBytes: number;
  downloadUrl: string | null;
  active: boolean;
  metadata: Record<string, unknown>;
  installedAt: string;
}

export type BackupType = 'full' | 'universe' | 'config';

export interface Backup {
  id: string;
  serverId: string;
  filename: string;
  sizeBytes: number;
  backupType: BackupType;
  retentionDays: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface MetricsSnapshot {
  serverId: string;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  networkRxBytes: number;
  networkTxBytes: number;
  jvmHeapUsedMb: number | null;
  jvmGcCount: number | null;
  jvmGcTimeMs: number | null;
  timestamp: string;
}

export interface HealthAnalysis {
  serverId: string;
  status: 'healthy' | 'warning' | 'critical';
  issues: HealthIssue[];
  lastChecked: string;
}

export interface HealthIssue {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  detectedAt: string;
}

export type TaskType = 'restart' | 'backup' | 'command' | 'mod_update' | 'start' | 'stop';
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed';

export interface ScheduledTask {
  id: string;
  serverId: string;
  name: string;
  taskType: TaskType;
  cronExpression: string | null;
  command: string | null;
  backupType: BackupType | null;
  modId: string | null;
  enabled: boolean;
  chainNextTaskId: string | null;
  timezone: string;
  lastRunAt: string | null;
  lastStatus: TaskStatus | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskExecution {
  id: string;
  taskId: string;
  status: TaskStatus;
  startedAt: string;
  completedAt: string | null;
  output: string | null;
  errorMessage: string | null;
  triggeredBy: 'schedule' | 'manual' | 'chain';
}

export interface AppSettings {
  id: 1;
  panelName: string;
  panelDescription: string | null;
  metricsRefreshIntervalSeconds: number;
  backupRetentionDays: number;
  metricsRetentionDays: number;
  logRetentionDays: number;
  maxServersPerUser: number;
  defaultMemoryLimitMb: number;
  defaultViewDistance: number;
  curseforgeApiKey: string | null;
  updatedAt: string;
}

export interface Permission {
  id: string;
  name: string;
  groupName: string;
  description: string | null;
}

export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  description: string | null;
  permissions?: Permission[];
}

export interface MonitoringOverview {
  totalServers: number;
  onlineServers: number;
  totalMemoryUsed: number;
  totalMemoryLimit: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// CurseForge types for the frontend
export interface CurseForgeMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  isFeatured: boolean;
  logo?: { url: string; thumbnailUrl: string };
  latestFiles?: CurseForgeFile[];
  dateCreated: string;
  dateModified: string;
}

export interface CurseForgeFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  releaseType: number;
  fileDate: string;
  fileLength: number;
  downloadUrl: string;
  gameVersions: string[];
  dependencies: { modId: number; relationType: number }[];
}