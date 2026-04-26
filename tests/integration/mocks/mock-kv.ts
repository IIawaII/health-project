import '../../../worker-configuration.d.ts';
export class MockKV {
  private store = new Map<string, { value: string; expiry?: number }>()

  async get(key: string): Promise<string | null>
  async get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  async get(key: string, type: 'stream'): Promise<ReadableStream | null>
  async get(key: string, typeOrOptions?: unknown): Promise<unknown> {
    const item = this.store.get(key)
    if (!item) return null
    if (item.expiry && item.expiry < Date.now()) {
      this.store.delete(key)
      return null
    }
    if (typeOrOptions === 'arrayBuffer') {
      return new TextEncoder().encode(item.value).buffer
    }
    if (typeOrOptions === 'stream') {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(item.value))
          controller.close()
        },
      })
    }
    return item.value
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiry = options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined
    this.store.set(key, { value, expiry })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  async list(options?: { prefix?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor: string }> {
    const prefix = options?.prefix || ''
    const keys = Array.from(this.store.keys())
      .filter((k) => k.startsWith(prefix))
      .map((name) => ({ name }))
    return { keys, list_complete: true, cursor: '' }
  }

  async getWithMetadata(): Promise<{ value: string | null; metadata: unknown | null }> {
    throw new Error('Not implemented')
  }

  clear(): void {
    this.store.clear()
  }

  getCount(): number {
    return this.store.size
  }
}
