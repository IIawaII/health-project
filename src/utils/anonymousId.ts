export function getAnonymousId(): string {
  let id = localStorage.getItem('health_project_anonymous_id')
  if (!id) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID()
    } else {
      const time = Date.now().toString(36)
      const random1 = Math.random().toString(36).slice(2, 8)
      const random2 = Math.random().toString(36).slice(2, 8)
      const perf = typeof performance !== 'undefined' ? performance.now().toString(36).slice(0, 4) : ''
      id = `anon-${time}-${random1}-${random2}${perf ? '-' + perf : ''}`
    }
    localStorage.setItem('health_project_anonymous_id', id)
  }
  return id
}
