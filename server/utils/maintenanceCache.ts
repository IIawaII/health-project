import { getCache } from './cacheManager'

const MAINTENANCE_CACHE_TTL_MS = 30_000

const cache = getCache('maintenance', { ttlMs: MAINTENANCE_CACHE_TTL_MS, maxSize: 1 })

export function getMaintenanceCache(): { value: boolean; expiry: number } | null {
  const value = cache.get('mode')
  if (value === undefined) return null
  return value as { value: boolean; expiry: number }
}

export function setMaintenanceCache(value: boolean): void {
  cache.set('mode', { value, expiry: Date.now() + MAINTENANCE_CACHE_TTL_MS })
}

export function invalidateMaintenanceCache(): void {
  cache.delete('mode')
}
