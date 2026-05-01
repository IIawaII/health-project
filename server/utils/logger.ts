type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

function getMinLogLevel(): LogLevel {
  let envLevel: string | undefined
  try {
    if (typeof globalThis !== 'undefined') {
      const globalEnv = (globalThis as Record<string, unknown>).LOG_LEVEL
      if (typeof globalEnv === 'string') envLevel = globalEnv.toUpperCase()
    }
  } catch { console.debug('Failed to read LOG_LEVEL from globalThis') }
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) return envLevel as LogLevel
  return 'INFO'
}

let currentMinLogLevel: LogLevel = getMinLogLevel()

export function setMinLogLevel(level: LogLevel): void {
  if (level in LOG_LEVEL_PRIORITY) {
    currentMinLogLevel = level
  }
}

export function getCurrentMinLogLevel(): LogLevel {
  return currentMinLogLevel
}

async function refreshLogLevelFromConfig(): Promise<void> {
  try {
    if (typeof globalThis !== 'undefined') {
      const db = (globalThis as Record<string, unknown>).__D1_DB as D1Database | undefined
      if (db) {
        const result = await db.prepare("SELECT value FROM system_configs WHERE key = 'log_level'").first<{ value: string }>()
        if (result?.value && result.value.toUpperCase() in LOG_LEVEL_PRIORITY) {
          currentMinLogLevel = result.value.toUpperCase() as LogLevel
        }
      }
    }
  } catch { /* ignore config read errors */ }
}

function getEnvironment(): string {
  try {
    if (typeof globalThis !== 'undefined') {
      const env = (globalThis as Record<string, unknown>).ENVIRONMENT
      if (typeof env === 'string') return env
    }
  } catch { console.debug('Failed to read ENVIRONMENT from globalThis') }
  return 'development'
}

const APP_VERSION = '1.0.0'
const environment = getEnvironment()

interface LogEntry {
  timestamp: string
  level: LogLevel
  module: string
  message: string
  env: string
  version: string
  requestId?: string
  context?: Record<string, unknown>
}

function formatLogHuman(entry: LogEntry): string {
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
  const reqId = entry.requestId ? ` [req:${entry.requestId}]` : ''
  return `[${entry.module}] ${entry.level}${reqId} ${entry.message}${ctx}`
}

function formatLogJson(entry: LogEntry): string {
  return JSON.stringify(entry)
}

const useJsonLog = environment === 'production'

function formatLog(entry: LogEntry): string {
  return useJsonLog ? formatLogJson(entry) : formatLogHuman(entry)
}

let currentRequestId: string | undefined

export function setRequestId(id: string | undefined): void {
  currentRequestId = id
}

export function getRequestId(): string | undefined {
  return currentRequestId
}

let lastLogLevelRefresh = 0
const LOG_LEVEL_REFRESH_INTERVAL = 60_000

function createLogger(module: string) {
  function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[currentMinLogLevel]) return

    const now = Date.now()
    if (now - lastLogLevelRefresh > LOG_LEVEL_REFRESH_INTERVAL) {
      lastLogLevelRefresh = now
      refreshLogLevelFromConfig().catch(() => {})
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      env: environment,
      version: APP_VERSION,
      requestId: currentRequestId,
      context,
    }
    const formatted = formatLog(entry)

    switch (level) {
      case 'ERROR':
        console.error(formatted)
        break
      case 'WARN':
        console.warn(formatted)
        break
      default:
        console.log(formatted)
    }
  }

  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => log('DEBUG', msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => log('INFO', msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => log('WARN', msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => log('ERROR', msg, ctx),
  }
}

export type Logger = ReturnType<typeof createLogger>

export function getLogger(module: string): Logger {
  return createLogger(module)
}
