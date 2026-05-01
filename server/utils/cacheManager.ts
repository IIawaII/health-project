export interface CacheEntry<T> {
  value: T
  expiry: number
}

export interface CacheOptions {
  ttlMs: number
  maxSize: number
}

const DEFAULT_OPTIONS: CacheOptions = {
  ttlMs: 60_000,
  maxSize: 100,
}

export class CacheManager<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private readonly ttlMs: number
  private readonly maxSize: number

  constructor(options: Partial<CacheOptions> = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_OPTIONS.ttlMs
    this.maxSize = options.maxSize ?? DEFAULT_OPTIONS.maxSize
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (entry.expiry <= Date.now()) {
      this.cache.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evict()
    }
    this.cache.set(key, {
      value,
      expiry: Date.now() + (ttlMs ?? this.ttlMs),
    })
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  private evict(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (entry.expiry <= now) {
        this.cache.delete(key)
      }
    }
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
  }
}

const caches: Record<string, CacheManager<unknown>> = {}

export function getCache<T = unknown>(name: string, options?: Partial<CacheOptions>): CacheManager<T> {
  if (!caches[name]) {
    caches[name] = new CacheManager(options)
  }
  return caches[name] as CacheManager<T>
}

export function resetAllCaches(): void {
  for (const cache of Object.values(caches)) {
    cache.clear()
  }
}

export function resetCache(name: string): void {
  if (caches[name]) {
    caches[name].clear()
    delete caches[name]
  }
}
