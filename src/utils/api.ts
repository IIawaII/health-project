export function isApiError(data: unknown): data is { error: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as Record<string, unknown>).error === 'string'
  )
}

export function getApiError(data: unknown): string | undefined {
  return isApiError(data) ? data.error : undefined
}

export function getStringField(data: unknown, field: string): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const value = (data as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}

export function getObjectField(data: unknown, field: string): Record<string, unknown> | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const value = (data as Record<string, unknown>)[field]
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

export function parseStreamChunk(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const choices = (data as Record<string, unknown>).choices
  if (!Array.isArray(choices)) return undefined
  const first = choices[0] as Record<string, unknown> | undefined
  if (!first) return undefined
  const delta = first.delta as Record<string, unknown> | undefined
  if (!delta) return undefined
  return typeof delta.content === 'string' ? delta.content : undefined
}
