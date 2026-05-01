/**
 * Drizzle ORM Schema 定义
 * 对应 D1 数据库中的所有表
 */

import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core'

// ==================== users 表 ====================
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').unique().notNull(),
    email: text('email').unique().notNull(),
    password_hash: text('password_hash').notNull(),
    avatar: text('avatar'),
    accountname: text('accountname'),
    role: text('role').default('user'),
    data_key: text('data_key'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_users_username').on(table.username),
    index('idx_users_email').on(table.email),
    index('idx_users_role').on(table.role),
    index('idx_users_data_key').on(table.data_key),
  ]
)

// ==================== verification_codes 表 ====================
export const verificationCodes = sqliteTable(
  'verification_codes',
  {
    purpose: text('purpose').notNull(),
    email: text('email').notNull(),
    code: text('code').notNull(),
    attempts: integer('attempts').default(0),
    created_at: integer('created_at').notNull(),
    expires_at: integer('expires_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.purpose, table.email] }),
    index('idx_verification_codes_email').on(table.email),
    index('idx_verification_codes_expires').on(table.expires_at),
  ]
)

// ==================== verification_code_cooldowns 表 ====================
export const verificationCodeCooldowns = sqliteTable(
  'verification_code_cooldowns',
  {
    purpose: text('purpose').notNull(),
    email: text('email').notNull(),
    sent_at: integer('sent_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.purpose, table.email] }),
  ]
)

// ==================== usage_logs 表 ====================
export const usageLogs = sqliteTable(
  'usage_logs',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id'),
    action: text('action').notNull(),
    metadata: text('metadata'),
    created_at: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_usage_logs_user_id').on(table.user_id),
    index('idx_usage_logs_action').on(table.action),
    index('idx_usage_logs_created_at').on(table.created_at),
    index('idx_usage_logs_user_created').on(table.user_id, table.created_at),
    index('idx_usage_logs_action_created').on(table.action, table.created_at),
  ]
)

// ==================== system_configs 表 ====================
export const systemConfigs = sqliteTable(
  'system_configs',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updated_at: integer('updated_at').notNull(),
  }
)

// ==================== audit_logs 表 ====================
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    admin_id: text('admin_id').notNull(),
    action: text('action').notNull(),
    target_type: text('target_type'),
    target_id: text('target_id'),
    details: text('details'),
    created_at: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_audit_logs_admin_id').on(table.admin_id),
    index('idx_audit_logs_created_at').on(table.created_at),
    index('idx_audit_logs_action').on(table.action),
    index('idx_audit_logs_target_type').on(table.target_type),
  ]
)

// ==================== request_metrics 表（性能监控） ====================
export const requestMetrics = sqliteTable(
  'request_metrics',
  {
    id: text('id').primaryKey(),
    path: text('path').notNull(),
    method: text('method').notNull(),
    status_code: integer('status_code').notNull(),
    latency_ms: integer('latency_ms').notNull(),
    user_id: text('user_id'),
    ip: text('ip'),
    created_at: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_request_metrics_path').on(table.path),
    index('idx_request_metrics_created_at').on(table.created_at),
    index('idx_request_metrics_status_code').on(table.status_code),
  ]
)

// ==================== user_ai_configs 表（用户 AI 配置加密存储） ====================
export const userAiConfigs = sqliteTable(
  'user_ai_configs',
  {
    user_id: text('user_id').primaryKey(),
    encrypted_config: text('encrypted_config').notNull(),
    config_iv: text('config_iv').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_user_ai_configs_user_id').on(table.user_id),
  ]
)

// ==================== backup_tasks 表（备份任务管理） ====================
export const backupTasks = sqliteTable(
  'backup_tasks',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    scope: text('scope').notNull().default('["database"]'),
    frequency: text('frequency').notNull().default('manual'),
    retention_days: integer('retention_days').notNull().default(30),
    is_paused: integer('is_paused').notNull().default(0),
    last_run_at: integer('last_run_at'),
    next_run_at: integer('next_run_at'),
    created_at: integer('created_at').notNull(),
    updated_at: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_backup_tasks_frequency').on(table.frequency),
    index('idx_backup_tasks_is_paused').on(table.is_paused),
    index('idx_backup_tasks_next_run').on(table.next_run_at),
  ]
)

// ==================== backup_records 表（备份执行记录） ====================
export const backupRecords = sqliteTable(
  'backup_records',
  {
    id: text('id').primaryKey(),
    task_id: text('task_id').notNull(),
    status: text('status').notNull().default('pending'),
    scope: text('scope').notNull(),
    size_bytes: integer('size_bytes').default(0),
    started_at: integer('started_at'),
    completed_at: integer('completed_at'),
    error_message: text('error_message'),
    created_at: integer('created_at').notNull(),
  },
  (table) => [
    index('idx_backup_records_task_id').on(table.task_id),
    index('idx_backup_records_status').on(table.status),
    index('idx_backup_records_created_at').on(table.created_at),
  ]
)
