/**
 * User DAO - 用户数据访问层 (Drizzle ORM)
 */

import { eq, and, ne, or, count, sql, gte } from 'drizzle-orm'
import { getDb, users, userAiConfigs, usageLogs, verificationCodes, verificationCodeCooldowns, type DbClient } from '../db'
import { getLogger } from '../utils/logger'

const logger = getLogger('UserDAO')

export interface DbUser {
  id: string
  username: string
  email: string
  password_hash: string
  avatar: string | null
  accountname: string | null
  role: string
  data_key: string | null
  created_at: number
  updated_at: number
}

/** 不含敏感字段的用户信息 */
export type DbUserPublic = Omit<DbUser, 'password_hash' | 'data_key'>

/** 获取 Drizzle 客户端 */
function db(d1: D1Database): DbClient {
  return getDb(d1)
}

export async function findUserByUsername(d1: D1Database, username: string): Promise<DbUser | null> {
  const result = await db(d1)
    .select()
    .from(users)
    .where(sql`${users.username} = ${username} COLLATE NOCASE`)
    .limit(1)
  return (result[0] as DbUser | undefined) ?? null
}

export async function findUserByEmail(d1: D1Database, email: string): Promise<DbUser | null> {
  const result = await db(d1)
    .select()
    .from(users)
    .where(sql`${users.email} = ${email} COLLATE NOCASE`)
    .limit(1)
  return (result[0] as DbUser | undefined) ?? null
}

export async function findUserById(d1: D1Database, id: string): Promise<DbUser | null> {
  const result = await db(d1)
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  return (result[0] as DbUser | undefined) ?? null
}

export async function findUserByIdPublic(d1: D1Database, id: string): Promise<DbUserPublic | null> {
  const result = await db(d1)
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      avatar: users.avatar,
      accountname: users.accountname,
      role: users.role,
      created_at: users.created_at,
      updated_at: users.updated_at,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  return (result[0] as DbUserPublic | undefined) ?? null
}

export async function createUser(
  d1: D1Database,
  user: Omit<DbUser, 'avatar' | 'accountname'> & { avatar?: string | null; accountname?: string | null }
): Promise<void> {
  logger.info('Creating user', { username: user.username, email: user.email })
  await db(d1)
    .insert(users)
    .values({
      id: user.id,
      username: user.username,
      email: user.email,
      password_hash: user.password_hash,
      avatar: user.avatar ?? null,
      accountname: user.accountname ?? null,
      role: user.role,
      data_key: user.data_key ?? null,
      created_at: user.created_at,
      updated_at: user.updated_at,
    })
    .run()
}

export async function updateUserPassword(d1: D1Database, id: string, passwordHash: string): Promise<void> {
  await db(d1)
    .update(users)
    .set({
      password_hash: passwordHash,
      updated_at: Math.floor(Date.now() / 1000),
    })
    .where(eq(users.id, id))
    .run()
}

const ALLOWED_UPDATE_COLUMNS = ['username', 'email', 'avatar', 'accountname'] as const

export async function updateUser(
  d1: D1Database,
  id: string,
  updates: Partial<Pick<DbUser, typeof ALLOWED_UPDATE_COLUMNS[number]>>
): Promise<void> {
  const invalidKeys = Object.keys(updates).filter(
    (k) => !(ALLOWED_UPDATE_COLUMNS as readonly string[]).includes(k)
  )
  if (invalidKeys.length > 0) {
    throw new Error(`Invalid update fields: ${invalidKeys.join(', ')}`)
  }

  const setData: Record<string, string | number | null> = {
    updated_at: Math.floor(Date.now() / 1000),
  }

  if (updates.username !== undefined) setData.username = updates.username
  if (updates.email !== undefined) setData.email = updates.email
  if (updates.avatar !== undefined) setData.avatar = updates.avatar
  if (updates.accountname !== undefined) setData.accountname = updates.accountname

  if (Object.keys(setData).length <= 1) return

  await db(d1)
    .update(users)
    .set(setData)
    .where(eq(users.id, id))
    .run()
}

export async function updateUserDataKey(d1: D1Database, id: string, dataKey: string): Promise<void> {
  await db(d1)
    .update(users)
    .set({
      data_key: dataKey,
      updated_at: Math.floor(Date.now() / 1000),
    })
    .where(eq(users.id, id))
    .run()
}

export async function updateUserRole(d1: D1Database, id: string, role: string): Promise<void> {
  await db(d1)
    .update(users)
    .set({
      role,
      updated_at: Math.floor(Date.now() / 1000),
    })
    .where(eq(users.id, id))
    .run()
}

export async function deleteUserById(d1: D1Database, id: string): Promise<void> {
  const drizzleDb = db(d1)

  const user = await drizzleDb
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  await drizzleDb.delete(userAiConfigs).where(eq(userAiConfigs.user_id, id)).run()
  await drizzleDb.delete(usageLogs).where(eq(usageLogs.user_id, id)).run()

  if (user.length > 0) {
    await drizzleDb
      .delete(verificationCodes)
      .where(eq(verificationCodes.email, user[0].email))
      .run()
    await drizzleDb
      .delete(verificationCodeCooldowns)
      .where(eq(verificationCodeCooldowns.email, user[0].email))
      .run()
  }

  await drizzleDb.delete(users).where(eq(users.id, id)).run()
}

export async function usernameExists(d1: D1Database, username: string, excludeId?: string): Promise<boolean> {
  const conditions = excludeId
    ? [sql`${users.username} = ${username} COLLATE NOCASE`, ne(users.id, excludeId)]
    : [sql`${users.username} = ${username} COLLATE NOCASE`]

  const result = await db(d1)
    .select({ found: sql<number>`1` })
    .from(users)
    .where(and(...conditions))
    .limit(1)
  return result.length > 0
}

export async function emailExists(d1: D1Database, email: string, excludeId?: string): Promise<boolean> {
  const conditions = excludeId
    ? [sql`${users.email} = ${email} COLLATE NOCASE`, ne(users.id, excludeId)]
    : [sql`${users.email} = ${email} COLLATE NOCASE`]

  const result = await db(d1)
    .select({ found: sql<number>`1` })
    .from(users)
    .where(and(...conditions))
    .limit(1)
  return result.length > 0
}

export async function getUserList(
  d1: D1Database,
  options: { limit?: number; offset?: number; search?: string } = {}
): Promise<{ users: DbUserPublic[]; total: number }> {
  const drizzleDb = db(d1)
  const limit = options.limit ?? 20
  const offset = options.offset ?? 0

  let whereClause = undefined
  if (options.search) {
    const searchTerm = options.search.slice(0, 100)
    const escaped = searchTerm.replace(/[%_]/g, '\\$&')
    const pattern = `%${escaped}%`
    whereClause = or(
      sql`${users.username} LIKE ${pattern} ESCAPE '\\'`,
      sql`${users.email} LIKE ${pattern} ESCAPE '\\'`
    )
  }

  const [usersResult, countResult] = await Promise.all([
    drizzleDb
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        avatar: users.avatar,
        accountname: users.accountname,
        role: users.role,
        created_at: users.created_at,
        updated_at: users.updated_at,
      })
      .from(users)
      .where(whereClause)
      .orderBy(sql`${users.created_at} DESC`)
      .limit(limit)
      .offset(offset),
    drizzleDb
      .select({ total: count() })
      .from(users)
      .where(whereClause),
  ])

  return {
    users: usersResult as DbUserPublic[],
    total: countResult[0]?.total ?? 0,
  }
}

export async function getDailyUserStats(d1: D1Database, days: number = 30): Promise<{ date: string; count: number }[]> {
  const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
  const result = await db(d1)
    .select({
      date: sql<string>`strftime('%Y-%m-%d', ${users.created_at}, 'unixepoch', '+8 hours')`,
      count: count(),
    })
    .from(users)
    .where(gte(users.created_at, cutoff))
    .groupBy(sql`strftime('%Y-%m-%d', ${users.created_at}, 'unixepoch', '+8 hours')`)
    .orderBy(sql`strftime('%Y-%m-%d', ${users.created_at}, 'unixepoch', '+8 hours') ASC`)
  return result as { date: string; count: number }[];
}
