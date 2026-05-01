import { findUserById, findUserByUsername, createUser, updateUser } from '../dao/user.dao'
import { getLogger } from '../utils/logger'

const logger = getLogger('AdminInit')

const ADMIN_USER_ID = 'system-admin'
const ADMIN_DEFAULT_AVATAR = 'User_1'
const ADMIN_INIT_KV_KEY = 'admin_initialized'
const ADMIN_INIT_KV_TTL = 3600

export async function ensureAdminInDatabase(
  d1: D1Database,
  adminUsername: string | undefined,
  adminPasswordHash: string | undefined,
  kv?: KVNamespace
): Promise<void> {
  if (!adminUsername || !adminPasswordHash) return

  if (!/^\d+:[a-f0-9]{32}:[a-f0-9]{64}$/i.test(adminPasswordHash)) {
    logger.warn('ADMIN_PASSWORD format invalid, skipping admin DB initialization')
    return
  }

  const iterations = parseInt(adminPasswordHash.split(':')[0], 10)
  if (iterations < 100000) {
    logger.warn('ADMIN_PASSWORD iterations too low, skipping admin DB initialization', { iterations })
    return
  }

  if (kv) {
    try {
      const cached = await kv.get(ADMIN_INIT_KV_KEY)
      if (cached === 'true') return
    } catch {
      logger.debug('KV unavailable, falling back to DB query for admin init check')
    }
  }

  try {
    const existing = await findUserById(d1, ADMIN_USER_ID)
    if (existing) {
      if (!existing.avatar) {
        await updateUser(d1, ADMIN_USER_ID, { avatar: ADMIN_DEFAULT_AVATAR })
        logger.info('Admin avatar updated')
      }
      if (kv) {
        try { await kv.put(ADMIN_INIT_KV_KEY, 'true', { expirationTtl: ADMIN_INIT_KV_TTL }) } catch { logger.debug('Failed to set admin init KV flag') }
      }
      return
    }

    const usernameConflict = await findUserByUsername(d1, adminUsername)
    if (usernameConflict) {
      logger.warn('Admin username already taken by another user', { username: adminUsername })
      if (kv) {
        try { await kv.put(ADMIN_INIT_KV_KEY, 'true', { expirationTtl: ADMIN_INIT_KV_TTL }) } catch { logger.debug('Failed to set admin init KV flag') }
      }
      return
    }

    const now = Math.floor(Date.now() / 1000)
    await createUser(d1, {
      id: ADMIN_USER_ID,
      username: adminUsername,
      email: 'admin@system.local',
      password_hash: adminPasswordHash,
      avatar: ADMIN_DEFAULT_AVATAR,
      role: 'admin',
      data_key: null,
      created_at: now,
      updated_at: now,
    })

    logger.info('Admin account initialized in database', { username: adminUsername })
    if (kv) {
      try { await kv.put(ADMIN_INIT_KV_KEY, 'true', { expirationTtl: ADMIN_INIT_KV_TTL }) } catch { logger.debug('Failed to set admin init KV flag') }
    }
  } catch (error) {
    logger.error('Failed to initialize admin account in database', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function resetAdminInitFlag(): void {
  // No-op: KV-based caching replaces module-level flag
}
