/**
 * Verification DAO - 验证码
 */

export type VerificationCodePurpose = 'register' | 'update_email'

export interface VerificationCodeRecord {
  purpose: VerificationCodePurpose
  email: string
  code: string
  createdAt: number
  expiresAt: number
}

export async function upsertVerificationCode(
  db: D1Database,
  record: VerificationCodeRecord
): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO verification_codes (purpose, email, code, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(purpose, email) DO UPDATE SET
       code = excluded.code,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at`
  )

  await stmt.bind(record.purpose, record.email, record.code, record.createdAt, record.expiresAt).run()
}

export async function deleteVerificationCode(
  db: D1Database,
  purpose: VerificationCodePurpose,
  email: string
): Promise<void> {
  const stmt = db.prepare('DELETE FROM verification_codes WHERE purpose = ? AND email = ?')
  await stmt.bind(purpose, email).run()
}

export async function checkVerificationCooldown(
  db: D1Database,
  purpose: VerificationCodePurpose,
  email: string,
  cooldownSeconds: number
): Promise<{ allowed: boolean; remainingSeconds: number }> {
  const stmt = db.prepare('SELECT sent_at FROM verification_code_cooldowns WHERE purpose = ? AND email = ?')
  const record = await stmt.bind(purpose, email).first<{ sent_at: number }>()

  if (!record) {
    return { allowed: true, remainingSeconds: 0 }
  }

  const sentAt = record.sent_at * 1000
  const now = Date.now()
  const elapsedSeconds = Math.floor((now - sentAt) / 1000)

  if (elapsedSeconds >= cooldownSeconds) {
    return { allowed: true, remainingSeconds: 0 }
  }

  return { allowed: false, remainingSeconds: cooldownSeconds - elapsedSeconds }
}

export async function setVerificationCooldown(
  db: D1Database,
  purpose: VerificationCodePurpose,
  email: string
): Promise<void> {
  const stmt = db.prepare(
    `INSERT INTO verification_code_cooldowns (purpose, email, sent_at)
     VALUES (?, ?, ?)
     ON CONFLICT(purpose, email) DO UPDATE SET
       sent_at = excluded.sent_at`
  )
  await stmt.bind(purpose, email, Math.floor(Date.now() / 1000)).run()
}

export async function deleteVerificationCooldown(
  db: D1Database,
  purpose: VerificationCodePurpose,
  email: string
): Promise<void> {
  const stmt = db.prepare('DELETE FROM verification_code_cooldowns WHERE purpose = ? AND email = ?')
  await stmt.bind(purpose, email).run()
}

/**
 * 清理所有已过期的验证码记录
 */
export async function cleanupExpiredVerificationCodes(db: D1Database): Promise<void> {
  const stmt = db.prepare("DELETE FROM verification_codes WHERE expires_at <= ?")
  await stmt.bind(new Date().toISOString()).run()
}

export async function consumeVerificationCode(
  db: D1Database,
  purpose: VerificationCodePurpose,
  email: string,
  code: string,
  now: number = Math.floor(Date.now() / 1000)
): Promise<'consumed' | 'not_found' | 'expired' | 'invalid'> {
  const deleteStmt = db.prepare(
    'DELETE FROM verification_codes WHERE purpose = ? AND email = ? AND code = ? AND expires_at > ?'
  )
  const deleteResult = await deleteStmt.bind(purpose, email, code, now).run()

  if (deleteResult.meta.changes > 0) {
    return 'consumed'
  }

  const lookupStmt = db.prepare('SELECT code, expires_at FROM verification_codes WHERE purpose = ? AND email = ?')
  const record = await lookupStmt.bind(purpose, email).first<{ code: string; expires_at: number }>()

  if (!record) {
    return 'not_found'
  }

  if (record.expires_at <= now) {
    await deleteVerificationCode(db, purpose, email)
    return 'expired'
  }

  return 'invalid'
}
