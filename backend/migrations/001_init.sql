-- HyDash Database Schema - Migration 001
-- Complete initial schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS AND AUTHENTICATION
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    legacy_role VARCHAR(50), -- 'admin', 'operator', 'viewer' (deprecated in favor of RBAC)
    api_key VARCHAR(255) UNIQUE,
    api_key_created_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_api_key ON users(api_key) WHERE api_key IS NOT NULL;

-- ============================================
-- RBAC: PERMISSIONS
-- ============================================
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    group_name VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO permissions (name, group_name, description) VALUES
    -- Server Management
    ('server.create', 'servers', 'Create new game servers'),
    ('server.start', 'servers', 'Start a stopped server'),
    ('server.stop', 'servers', 'Stop a running server'),
    ('server.restart', 'servers', 'Restart a running server'),
    ('server.delete', 'servers', 'Delete a server and its data'),
    ('server.configure', 'servers', 'Modify server configuration'),
    -- Backup Management
    ('backup.create', 'backups', 'Create server backups'),
    ('backup.restore', 'backups', 'Restore from a backup'),
    ('backup.delete', 'backups', 'Delete a backup'),
    -- Mod Management
    ('mod.install', 'mods', 'Install mods on a server'),
    ('mod.uninstall', 'mods', 'Remove mods from a server'),
    ('mod.update', 'mods', 'Update mods to newer versions'),
    -- Monitoring
    ('monitoring.view', 'monitoring', 'View server metrics and logs'),
    ('monitoring.manage', 'monitoring', 'Configure monitoring settings'),
    -- Scheduled Tasks
    ('task.create', 'tasks', 'Create scheduled tasks'),
    ('task.execute', 'tasks', 'Manually execute scheduled tasks'),
    ('task.delete', 'tasks', 'Delete scheduled tasks'),
    -- User Management
    ('user.manage', 'users', 'Manage users and roles'),
    ('user.view', 'users', 'View user information');

-- ============================================
-- RBAC: ROLES
-- ============================================
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    is_system BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (name, is_system, description) VALUES
    ('admin', true, 'Full system access'),
    ('operator', true, 'Server management and monitoring'),
    ('viewer', true, 'Read-only access to dashboards');

-- ============================================
-- RBAC: ROLE-PERMISSION MAPPING
-- ============================================
CREATE TABLE role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'admin';

-- Operator gets server/backup/mod/monitoring/task permissions (not user management)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'operator' AND p.group_name IN ('servers', 'backups', 'mods', 'monitoring', 'tasks');

-- Viewer gets view permissions only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'viewer' AND p.name IN ('monitoring.view', 'user.view');

-- ============================================
-- RBAC: USER-ROLE MAPPING
-- ============================================
CREATE TABLE user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- ============================================
-- SERVERS
-- ============================================
CREATE TABLE servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    port INTEGER NOT NULL DEFAULT 5520,
    memory_limit_mb INTEGER NOT NULL DEFAULT 6144,
    cpu_quota_micro INTEGER DEFAULT 100000, -- 100ms per 100ms = 1 CPU
    view_distance INTEGER DEFAULT 12,
    status VARCHAR(20) DEFAULT 'stopped',
    container_id VARCHAR(100),
    tags TEXT[] DEFAULT '{}',
    autostart BOOLEAN DEFAULT false,
    config JSONB DEFAULT '{}',
    jvm_args TEXT DEFAULT '-Xms6G -Xmx6G -XX:+UseG1GC',
    server_args TEXT DEFAULT '--assets ../Assets.zip --backup --backup-frequency 30',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_servers_owner ON servers(owner_id);
CREATE INDEX idx_servers_status ON servers(status);

-- ============================================
-- SERVER USER MEMBERSHIPS
-- ============================================
CREATE TABLE server_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'moderator', -- 'owner', 'moderator'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(server_id, user_id)
);

-- ============================================
-- MODS
-- ============================================
CREATE TABLE mods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    curseforge_id INTEGER,
    mod_slug VARCHAR(255),
    file_name VARCHAR(255) NOT NULL,
    file_version VARCHAR(100),
    file_type VARCHAR(20) DEFAULT 'release', -- 'release', 'beta', 'alpha'
    file_size_bytes BIGINT DEFAULT 0,
    download_url TEXT,
    active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    installed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mods_server ON mods(server_id);
CREATE INDEX idx_mods_curseforge ON mods(curseforge_id);

-- ============================================
-- BACKUPS
-- ============================================
CREATE TABLE backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    backup_type VARCHAR(20) DEFAULT 'full', -- 'full', 'universe', 'config'
    retention_days INTEGER DEFAULT 14,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_backups_server ON backups(server_id);
CREATE INDEX idx_backups_expires ON backups(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================
-- SERVER LOGS (ring buffer, auto-pruned)
-- ============================================
CREATE TABLE server_logs (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    level VARCHAR(20) DEFAULT 'INFO',
    message TEXT NOT NULL,
    source VARCHAR(50) DEFAULT 'server' -- 'server', 'jvm', 'system'
);

CREATE INDEX idx_logs_server_time ON server_logs(server_id, timestamp DESC);

-- ============================================
-- SCHEDULED TASKS
-- ============================================
CREATE TABLE scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    task_type VARCHAR(30) NOT NULL, -- 'restart', 'backup', 'command', 'mod_update', 'start', 'stop'
    cron_expression VARCHAR(100), -- null for one-time tasks
    command TEXT, -- for 'command' type
    backup_type VARCHAR(20), -- for 'backup' type
    mod_id UUID REFERENCES mods(id), -- for 'mod_update' type
    enabled BOOLEAN DEFAULT true,
    chain_next_task_id UUID REFERENCES scheduled_tasks(id) ON DELETE SET NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    last_run_at TIMESTAMPTZ,
    last_status VARCHAR(20), -- 'pending', 'running', 'success', 'failed'
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_tasks_server ON scheduled_tasks(server_id);
CREATE INDEX idx_scheduled_tasks_next_run ON scheduled_tasks(next_run_at) WHERE enabled = true;

-- ============================================
-- TASK EXECUTION HISTORY
-- ============================================
CREATE TABLE task_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'success', 'failed'
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    output TEXT,
    error_message TEXT,
    triggered_by VARCHAR(20) DEFAULT 'schedule' -- 'schedule', 'manual', 'chain'
);

CREATE INDEX idx_task_exec_task ON task_executions(task_id, started_at DESC);

-- ============================================
-- METRICS HISTORY (time-series optimized)
-- ============================================
CREATE TABLE metrics_history (
    id BIGSERIAL PRIMARY KEY,
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    cpu_percent REAL NOT NULL,
    memory_used_mb REAL NOT NULL,
    memory_limit_mb REAL NOT NULL,
    network_rx_bytes BIGINT DEFAULT 0,
    network_tx_bytes BIGINT DEFAULT 0,
    jvm_heap_used_mb REAL,
    jvm_gc_count INTEGER,
    jvm_gc_time_ms INTEGER
);

CREATE INDEX idx_metrics_server_time ON metrics_history(server_id, timestamp DESC);

-- ============================================
-- APP SETTINGS (single-row global config)
-- ============================================
CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    panel_name VARCHAR(100) DEFAULT 'HyDash',
    panel_description TEXT,
    metrics_refresh_interval_seconds INTEGER DEFAULT 5,
    backup_retention_days INTEGER DEFAULT 14,
    metrics_retention_days INTEGER DEFAULT 90,
    log_retention_days INTEGER DEFAULT 30,
    max_servers_per_user INTEGER DEFAULT 5,
    default_memory_limit_mb INTEGER DEFAULT 6144,
    default_view_distance INTEGER DEFAULT 12,
    curseforge_api_key VARCHAR(255),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (panel_name, panel_description) VALUES ('HyDash', 'Hytale Game Server Hosting Panel');

-- ============================================
-- TRIGGER: updated_at auto-update
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_servers_updated_at BEFORE UPDATE ON servers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_scheduled_tasks_updated_at BEFORE UPDATE ON scheduled_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_app_settings_updated_at BEFORE UPDATE ON app_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION: cleanup expired backups
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_backups()
RETURNS void AS $$
BEGIN
    DELETE FROM backups WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: cleanup old metrics
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_metrics(retention_days INTEGER)
RETURNS void AS $$
BEGIN
    DELETE FROM metrics_history WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: cleanup old server logs
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_logs(retention_days INTEGER)
RETURNS void AS $$
BEGIN
    DELETE FROM server_logs WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: calculate next run time from cron expression
-- ============================================
CREATE OR REPLACE FUNCTION calculate_next_run(cron_expr TEXT, tz TEXT DEFAULT 'UTC')
RETURNS TIMESTAMPTZ AS $$
DECLARE
    next_time TIMESTAMPTZ;
BEGIN
    -- Simple approximation: parse cron and calculate next occurrence
    -- For accurate cron parsing, the application layer handles this
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;