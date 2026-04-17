import { z } from 'zod';

// ============================================
// Auth Types
// ============================================
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(100).optional(),
});

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  roles: string[];
  permissions: string[];
  type?: 'access' | 'refresh';
}

// ============================================
// User Types
// ============================================
export interface User {
  id: string;
  email: string;
  displayName: string | null;
  legacyRole: string | null;
  apiKey: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithRoles extends User {
  roles: Role[];
  permissions: string[];
}

// ============================================
// RBAC Types
// ============================================
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

export const createRoleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

// ============================================
// Server Types
// ============================================
export type ServerStatus = 'creating' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

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
  createdAt: Date;
  updatedAt: Date;
}

export const createServerSchema = z.object({
  name: z.string().min(2).max(100),
  port: z.number().int().min(1024).max(65535).default(5520),
  memoryLimitMb: z.number().int().min(1024).max(32768).default(6144),
  cpuQuotaMicro: z.number().int().min(10000).default(100000),
  viewDistance: z.number().int().min(4).max(32).default(12),
  tags: z.array(z.string()).default([]),
  autostart: z.boolean().default(false),
  jvmArgs: z.string().default('-Xms6G -Xmx6G -XX:+UseG1GC'),
  serverArgs: z.string().default('--assets ../Assets.zip --backup --backup-dir backups --backup-frequency 30'),
});

export const updateServerSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  memoryLimitMb: z.number().int().min(1024).max(32768).optional(),
  cpuQuotaMicro: z.number().int().min(10000).optional(),
  viewDistance: z.number().int().min(4).max(32).optional(),
  tags: z.array(z.string()).optional(),
  autostart: z.boolean().optional(),
  jvmArgs: z.string().optional(),
  serverArgs: z.string().optional(),
});

// Hytale config.json (PascalCase as Hytale expects it)
export interface HytaleConfig {
  ConfigVersion: number;
  ServerName: string;
  MOTD: string;
  Password: string;
  MaxPlayers: number;
  MaxViewRadius: number;
  LocalCompressionEnabled: boolean;
  ConnectionTimeouts: {
    InitialTimeout: string;
    AuthTimeout: string;
    PlayTimeout: string;
    JoinTimeouts: Record<string, string>;
  };
  RateLimit: {
    Enabled: boolean;
    PacketsPerSecond: number;
    BurstCapacity: number;
  };
  PlayerStorage: { Type: string };
  AuthCredentialStore: { Type: string; Path?: string };
  LogLevels: Record<string, string>;
  Modules: Record<string, unknown>;
  Mods: Record<string, { Enabled: boolean; RequiredVersion?: string }>;
  Update: {
    Enabled: boolean;
    CheckIntervalSeconds: number;
    NotifyPlayersOnAvailable: boolean;
    Patchline: string | null;
    RunBackupBeforeUpdate: boolean;
    BackupConfigBeforeUpdate: boolean;
    AutoApplyMode: string;
    AutoApplyDelayMinutes: number;
  };
}

// ============================================
// Mod Types
// ============================================
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
  installedAt: Date;
}

export const installModSchema = z.object({
  curseforgeId: z.number().int(),
  fileId: z.number().int().optional(),
});

// ============================================
// Backup Types
// ============================================
export type BackupType = 'full' | 'universe' | 'config';

export interface Backup {
  id: string;
  serverId: string;
  filename: string;
  sizeBytes: number;
  backupType: BackupType;
  retentionDays: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export const createBackupSchema = z.object({
  backupType: z.enum(['full', 'universe', 'config']).default('full'),
  retentionDays: z.number().int().min(1).max(365).default(14),
});

// ============================================
// Monitoring Types
// ============================================
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
  playerCount: number | null;
  maxPlayers: number | null;
  timestamp: Date;
}

export interface HealthAnalysis {
  serverId: string;
  status: 'healthy' | 'warning' | 'critical';
  issues: HealthIssue[];
  lastChecked: Date;
}

export interface HealthIssue {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  detectedAt: Date;
}

// ============================================
// Scheduled Task Types
// ============================================
export type TaskType = 'restart' | 'backup' | 'command' | 'mod_update' | 'start' | 'stop';
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed';
export type TriggeredBy = 'schedule' | 'manual' | 'chain';

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
  lastRunAt: Date | null;
  lastStatus: TaskStatus | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskExecution {
  id: string;
  taskId: string;
  status: TaskStatus;
  startedAt: Date;
  completedAt: Date | null;
  output: string | null;
  errorMessage: string | null;
  triggeredBy: TriggeredBy;
}

export const createTaskSchema = z.object({
  name: z.string().min(2).max(100),
  taskType: z.enum(['restart', 'backup', 'command', 'mod_update', 'start', 'stop']),
  cronExpression: z.string().nullable().optional(),
  command: z.string().nullable().optional(),
  backupType: z.enum(['full', 'universe', 'config']).optional(),
  modId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().default(true),
  chainNextTaskId: z.string().uuid().nullable().optional(),
  timezone: z.string().default('UTC'),
});

export const updateTaskSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  cronExpression: z.string().nullable().optional(),
  command: z.string().optional(),
  enabled: z.boolean().optional(),
  chainNextTaskId: z.string().uuid().nullable().optional(),
  timezone: z.string().optional(),
});

// ============================================
// App Settings Types
// ============================================
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
  updatedAt: Date;
}

export const updateSettingsSchema = z.object({
  panelName: z.string().min(2).max(100).optional(),
  panelDescription: z.string().optional(),
  metricsRefreshIntervalSeconds: z.number().int().min(1).max(60).optional(),
  backupRetentionDays: z.number().int().min(1).max(365).optional(),
  metricsRetentionDays: z.number().int().min(1).max(365).optional(),
  logRetentionDays: z.number().int().min(1).max(365).optional(),
  maxServersPerUser: z.number().int().min(1).max(100).optional(),
  defaultMemoryLimitMb: z.number().int().min(1024).max(32768).optional(),
  defaultViewDistance: z.number().int().min(4).max(32).optional(),
  curseforgeApiKey: z.string().optional(),
});

// ============================================
// Log Types
// ============================================
export interface ServerLog {
  id: number;
  serverId: string;
  timestamp: Date;
  level: string;
  message: string;
  source: string;
}

// ============================================
// API Response Types
// ============================================
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

// ============================================
// Docker Container Types
// ============================================
export interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  image: string;
  ports: { host: number; container: number; protocol: string }[];
  createdAt: Date;
}

export interface ContainerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

// ============================================
// CurseForge Types
// ============================================
export interface CurseForgeMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  isFeatured: boolean;
  primaryCategoryId: number;
  categories: CurseForgeCategory[];
  authors: CurseForgeAuthor[];
  logo: CurseForgeAsset;
  latestFiles: CurseForgeFile[];
  dateCreated: string;
  dateModified: string;
  dateReleased: string;
}

export interface CurseForgeFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  releaseType: number; // 1=Release, 2=Beta, 3=Alpha
  fileDate: string;
  fileLength: number;
  downloadCount: number;
  downloadUrl: string;
  gameVersions: string[];
  dependencies: CurseForgeDependency[];
  hashes: { value: string; algo: number }[];
  isServerPack: boolean;
}

export interface CurseForgeCategory {
  id: number;
  name: string;
  slug: string;
  iconUrl: string;
}

export interface CurseForgeAuthor {
  id: number;
  name: string;
  url: string;
}

export interface CurseForgeAsset {
  id: number;
  url: string;
  thumbnailUrl: string;
}

export interface CurseForgeDependency {
  modId: number;
  relationType: number; // 1=Embedded, 2=Optional, 3=Required, 4=Tool, 5=Incompatible, 6=Include
}

// ============================================
// Hytale Auth Types
// ============================================
export interface HytaleDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

export interface HytaleAuthResult {
  success: boolean;
  error?: string;
  credentialPath?: string;
}

// ============================================
// WebSocket Message Types
// ============================================
export interface WsConsoleMessage {
  type: 'log' | 'command' | 'status' | 'error';
  data: string;
  timestamp?: string;
  level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
}

export interface WsAuthState {
  type: 'auth_state';
  state: 'pending' | 'authorized' | 'expired' | 'error';
  userCode?: string;
  verificationUrl?: string;
}

// Express Request augmentation
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      serverId?: string;
    }
  }
}