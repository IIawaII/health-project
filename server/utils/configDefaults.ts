import { getSystemConfig } from '../dao/config.dao'
import { getLogger } from './logger'

const logger = getLogger('ConfigDefaults')

export const CONFIG_DEFAULTS: Record<string, string> = {
  max_request_body_size: '10485760',
  smtp_timeout_ms: '15000',
  max_login_failures: '5',
  account_lockout_seconds: '900',
  metrics_sample_rate: '0.1',
}

export async function getConfigValue(
  d1: D1Database,
  key: string,
  defaultValue: string
): Promise<string> {
  try {
    const config = await getSystemConfig(d1, key)
    if (config && config.value) return config.value
  } catch {
    logger.debug('Failed to read config from DB, using default', { key })
  }
  return defaultValue
}

export async function getConfigNumber(
  d1: D1Database,
  key: string,
  defaultValue: number
): Promise<number> {
  const raw = await getConfigValue(d1, key, String(defaultValue))
  const num = Number(raw)
  if (isNaN(num)) {
    logger.warn('Invalid number config, using default', { key, raw })
    return defaultValue
  }
  return num
}
