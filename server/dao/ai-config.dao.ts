import { getLogger } from '../utils/logger'

const logger = getLogger('AiConfigDAO')

interface AiConfigRow {
  user_id: string
  encrypted_config: string
  config_iv: string
  updated_at: number
}

export async function getAiConfig(d1: D1Database, userId: string): Promise<AiConfigRow | null> {
  try {
    const result = await d1.prepare('SELECT user_id, encrypted_config, config_iv, updated_at FROM user_ai_configs WHERE user_id = ?').bind(userId).first<AiConfigRow>()
    return result ?? null
  } catch (error) {
    logger.error('Failed to get AI config', { userId, error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export async function upsertAiConfig(d1: D1Database, userId: string, encryptedConfig: string, configIv: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  try {
    await d1.prepare(
      `INSERT INTO user_ai_configs (user_id, encrypted_config, config_iv, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET encrypted_config = excluded.encrypted_config, config_iv = excluded.config_iv, updated_at = excluded.updated_at`
    ).bind(userId, encryptedConfig, configIv, now).run()
  } catch (error) {
    logger.error('Failed to upsert AI config', { userId, error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

export async function deleteAiConfig(d1: D1Database, userId: string): Promise<void> {
  try {
    await d1.prepare('DELETE FROM user_ai_configs WHERE user_id = ?').bind(userId).run()
  } catch (error) {
    logger.error('Failed to delete AI config', { userId, error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
