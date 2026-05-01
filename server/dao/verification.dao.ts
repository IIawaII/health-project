/**
 * Verification DAO - 验证码 (Drizzle ORM + SHA-256 哈希)
 */

import { eq, and, sql } from 'drizzle-orm'
import { getDb, verificationCodes, verificationCodeCooldowns, type DbClient } from '../db'
import { sha256Hash } from '../utils/crypto'
import { getLogger } from '../utils/logger'

const logger = getLogger('VerificationDAO')

export type VerificationCodePurpose = 'register' | 'update_email'

export interface VerificationCodeRecord {
  purpose: VerificationCodePurpose
  email: string
  code: string
  createdAt: number
  expiresAt: number
}

function db(d1: D1Database): DbClient {
  return getDb(d1)
}

export async function upsertVerificationCode(
  d1: D1Database,
  record: VerificationCodeRecord
): Promise<void> {
  const codeHash = await sha256Hash(record.code)
  logger.info('Upserting verification code', { purpose: record.purpose, email: record.email })

  await db(d1)
    .insert(verificationCodes)
    .values({
      purpose: record.purpose,
      email: record.email,
      code: codeHash,
      created_at: record.createdAt,
      expires_at: record.expiresAt,
    })
    .onConflictDoUpdate({
      target: [verificationCodes.purpose, verificationCodes.email],
      set: {
        code: codeHash,
        created_at: record.createdAt,
        expires_at: record.expiresAt,
      },
    })
    .run()
}

export async function deleteVerificationCode(
  d1: D1Database,
  purpose: VerificationCodePurpose,
  email: string
): Promise<void> {
  await db(d1)
    .delete(verificationCodes)
    .where(
      and(
        eq(verificationCodes.purpose, purpose),
        eq(verificationCodes.email, email)
      )
    )
    .run()
}

export async function checkVerificationCooldown(
  d1: D1Database,
  purpose: VerificationCodePurpose,
  email: string,
  cooldownSeconds: number
): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const result = await db(d1)
    .select({ sent_at: verificationCodeCooldowns.sent_at })
    .from(verificationCodeCooldowns)
    .where(
      and(
        eq(verificationCodeCooldowns.purpose, purpose),
        eq(verificationCodeCooldowns.email, email)
      )
    )
    .limit(1)

  if (result.length === 0) {
    return { allowed: true, remainingSeconds: 0 }
  }

  const sentAt = result[0].sent_at * 1000
  const now = Date.now()
  const elapsedSeconds = Math.floor((now - sentAt) / 1000)

  if (elapsedSeconds >= cooldownSeconds) {
    return { allowed: true, remainingSeconds: 0 }
  }

  return { allowed: false, remainingSeconds: cooldownSeconds - elapsedSeconds }
}

export async function setVerificationCooldown(
  d1: D1Database,
  purpose: VerificationCodePurpose,
  email: string
): Promise<void> {
  await db(d1)
    .insert(verificationCodeCooldowns)
    .values({
      purpose,
      email,
      sent_at: Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: [verificationCodeCooldowns.purpose, verificationCodeCooldowns.email],
      set: { sent_at: Math.floor(Date.now() / 1000) },
    })
    .run()
}

export async function deleteVerificationCooldown(
  d1: D1Database,
  purpose: VerificationCodePurpose,
  email: string
): Promise<void> {
  await db(d1)
    .delete(verificationCodeCooldowns)
    .where(
      and(
        eq(verificationCodeCooldowns.purpose, purpose),
        eq(verificationCodeCooldowns.email, email)
      )
    )
    .run()
}

/**
 * 清理所有已过期的验证码记录
 */
export async function cleanupExpiredVerificationCodes(d1: D1Database): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db(d1)
    .delete(verificationCodes)
    .where(sql`${verificationCodes.expires_at} <= ${now}`)
    .run()
}

const MAX_VERIFICATION_ATTEMPTS = 5

export async function consumeVerificationCode(
  d1: D1Database,
  purpose: VerificationCodePurpose,
  email: string,
  code: string,
  now: number = Math.floor(Date.now() / 1000)
): Promise<'consumed' | 'not_found' | 'expired' | 'invalid' | 'too_many_attempts'> {
  const drizzleDb = db(d1)

  const record = await drizzleDb
    .select({
      code: verificationCodes.code,
      expires_at: verificationCodes.expires_at,
      attempts: verificationCodes.attempts,
    })
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.purpose, purpose),
        eq(verificationCodes.email, email)
      )
    )
    .limit(1)

  if (record.length === 0) {
    return 'not_found'
  }

  if (record[0].expires_at <= now) {
    await deleteVerificationCode(d1, purpose, email)
    return 'expired'
  }

  const currentAttempts = record[0].attempts ?? 0
  if (currentAttempts >= MAX_VERIFICATION_ATTEMPTS) {
    await deleteVerificationCode(d1, purpose, email)
    return 'too_many_attempts'
  }

  const codeHash = await sha256Hash(code)

  if (codeHash !== record[0].code) {
    await drizzleDb
      .update(verificationCodes)
      .set({ attempts: currentAttempts + 1 })
      .where(
        and(
          eq(verificationCodes.purpose, purpose),
          eq(verificationCodes.email, email)
        )
      )
      .run()
    return 'invalid'
  }

  const deleteResult = await drizzleDb
    .delete(verificationCodes)
    .where(
      and(
        eq(verificationCodes.purpose, purpose),
        eq(verificationCodes.email, email)
      )
    )
    .run()

  if (!deleteResult.meta.changes || deleteResult.meta.changes === 0) {
    return 'not_found'
  }

  logger.info('Verification code consumed', { purpose, email })
  return 'consumed'
}
