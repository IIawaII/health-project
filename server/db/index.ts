import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'
import { getLogger } from '../utils/logger'

const logger = getLogger('DB')

export type DbClient = ReturnType<typeof createDb>

function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

let cachedD1: D1Database | null = null
let cachedDb: DbClient | null = null

export function getDb(d1: D1Database): DbClient {
  if (cachedD1 === d1 && cachedDb) {
    return cachedDb
  }
  logger.info('Creating new Drizzle instance')
  cachedD1 = d1
  cachedDb = createDb(d1)
  return cachedDb
}

export function resetDbCache(): void {
  cachedD1 = null
  cachedDb = null
}

export * from './schema'
