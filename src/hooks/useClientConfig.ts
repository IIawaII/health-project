import { useState, useEffect } from 'react'
import { MAINTENANCE_MODE, ENABLE_REGISTRATION } from '@/config/app'
import { fetchWithTimeout } from '@/api/client'

interface PublicConfig {
  maintenance_mode: boolean
  enable_registration: boolean
}

let globalConfig: PublicConfig = {
  maintenance_mode: MAINTENANCE_MODE === 'true',
  enable_registration: ENABLE_REGISTRATION !== 'false',
}

let initialized = false
const listeners: Set<() => void> = new Set()

function notifyListeners() {
  listeners.forEach((fn) => fn())
}

async function setGlobalConfig(config: PublicConfig) {
  globalConfig = config
  if (!initialized) initialized = true
  const win = window as unknown as { __ENV__?: Record<string, string> }
  if (win.__ENV__) {
    win.__ENV__.MAINTENANCE_MODE = config.maintenance_mode ? 'true' : 'false'
    win.__ENV__.ENABLE_REGISTRATION = config.enable_registration ? 'true' : 'false'
  }
  notifyListeners()
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollRefCount = 0
let initPromise: Promise<PublicConfig> | null = null

const POLL_INTERVAL = 15_000

async function fetchPublicConfig(): Promise<PublicConfig | null> {
  try {
    const res = await fetchWithTimeout('/api/config/public', {
      timeout: 5000,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    if (res.ok) {
      const data = await res.json() as { maintenance_mode?: boolean; enable_registration?: boolean }
      return {
        maintenance_mode: !!data.maintenance_mode,
        enable_registration: data.enable_registration !== false,
      }
    }
    return null
  } catch {
    return null
  }
}

function ensureInitialized(): Promise<PublicConfig> {
  if (initPromise) return initPromise
  initPromise = fetchPublicConfig().then((config) => {
    if (config) setGlobalConfig(config)
    else initialized = true
    return globalConfig
  })
  return initPromise
}

function startPolling() {
  pollRefCount++
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    const config = await fetchPublicConfig()
    if (config && (config.maintenance_mode !== globalConfig.maintenance_mode || config.enable_registration !== globalConfig.enable_registration)) {
      setGlobalConfig(config)
    }
  }, POLL_INTERVAL)
}

function stopPolling() {
  pollRefCount--
  if (pollRefCount <= 0) {
    pollRefCount = 0
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }
}

export interface ClientConfigState {
  config: PublicConfig
  initialized: boolean
}

export function useClientConfig(): ClientConfigState {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const handler = () => forceUpdate((n) => n + 1)
    listeners.add(handler)
    startPolling()

    ensureInitialized().then(() => forceUpdate((n) => n + 1))

    return () => {
      listeners.delete(handler)
      stopPolling()
    }
  }, [])

  return { config: globalConfig, initialized }
}

export function useMaintenanceMode(): { value: boolean; initialized: boolean } {
  const { config, initialized } = useClientConfig()
  return { value: config.maintenance_mode, initialized }
}

export function useRegistrationEnabled(): { value: boolean; initialized: boolean } {
  const { config, initialized } = useClientConfig()
  return { value: config.enable_registration, initialized }
}

export async function refreshClientConfig(): Promise<PublicConfig> {
  const config = await fetchPublicConfig()
  if (config) setGlobalConfig(config)
  return globalConfig
}
