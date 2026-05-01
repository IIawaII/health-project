import type { ApiConfig } from '@/types'
import i18n from '@/i18n'
import { fetchWithTimeout } from '@/api/client'

const SERVER_CONFIG_KEY = 'health_ai_config_enc'
const SERVER_CONFIG_IV_KEY = 'health_ai_config_iv'

function hexToBytes(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g)
  if (!pairs) throw new Error('Invalid hex string')
  return new Uint8Array(pairs.map((b) => parseInt(b, 16)))
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function getCryptoKey(hexKey: string): Promise<CryptoKey> {
  const keyData = hexToBytes(hexKey)
  return crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptApiConfigData(config: ApiConfig, dataKey: string): Promise<{ encrypted: string; iv: string }> {
  const key = await getCryptoKey(dataKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()
  const plaintext = encoder.encode(JSON.stringify(config))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )

  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return {
    encrypted: bytesToBase64(combined),
    iv: bytesToHex(iv),
  }
}

async function decryptApiConfigData(encryptedBase64: string, dataKey: string): Promise<ApiConfig | null> {
  try {
    const key = await getCryptoKey(dataKey)
    const combined = base64ToBytes(encryptedBase64)
    const iv = combined.slice(0, 12)
    const ciphertext = combined.slice(12)

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )

    const decoder = new TextDecoder()
    const json = JSON.parse(decoder.decode(plaintext))
    return {
      baseUrl: String(json.baseUrl || ''),
      apiKey: String(json.apiKey || ''),
      model: String(json.model || ''),
    }
  } catch {
    return null
  }
}

function getDataKey(): string | null {
  try { return sessionStorage.getItem('user_data_key'); } catch { return null; }
}

function setSessionDataKey(key: string): void {
  sessionStorage.setItem('user_data_key', key)
}

async function fetchServerConfig(): Promise<{ encryptedConfig: string; configIv: string } | null> {
  try {
    const response = await fetchWithTimeout('/api/auth/ai-config', { timeout: 8000 })
    if (!response.ok) return null
    const data = await response.json() as { success?: boolean; data?: { encryptedConfig?: string; configIv?: string } }
    if (data?.success && data?.data) {
      return {
        encryptedConfig: data.data.encryptedConfig ?? '',
        configIv: data.data.configIv ?? '',
      }
    }
    return null
  } catch {
    return null
  }
}

async function saveConfigToServer(encryptedConfig: string, configIv: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout('/api/auth/ai-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedConfig, configIv }),
      timeout: 8000,
    })
    return response.ok
  } catch {
    return false
  }
}

async function deleteConfigFromServer(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout('/api/auth/ai-config', {
      method: 'DELETE',
      timeout: 8000,
    })
    return response.ok
  } catch {
    return false
  }
}

let configMemoryCache: ApiConfig | null = null

export function initSessionDataKey(dataKey: string): void {
  setSessionDataKey(dataKey)
  configMemoryCache = null
}

export async function getStoredApiConfig(): Promise<ApiConfig | null> {
  if (configMemoryCache) return configMemoryCache

  const dataKey = getDataKey()
  if (!dataKey) return null

  const serverConfig = await fetchServerConfig()
  if (serverConfig?.encryptedConfig) {
    const decrypted = await decryptApiConfigData(serverConfig.encryptedConfig, dataKey)
    if (decrypted) {
      configMemoryCache = decrypted
      return decrypted
    }
  }

  const localRaw = localStorage.getItem(SERVER_CONFIG_KEY)
  if (localRaw) {
    const decrypted = await decryptApiConfigData(localRaw, dataKey)
    if (decrypted) {
      configMemoryCache = decrypted
      return decrypted
    }
  }

  return null
}

export async function saveApiConfig(config: ApiConfig): Promise<void> {
  const dataKey = getDataKey()
  if (!dataKey) {
    throw new Error(i18n.t('apiConfig.errors.missingKey'))
  }

  const { encrypted, iv } = await encryptApiConfigData(config, dataKey)

  await saveConfigToServer(encrypted, iv)

  localStorage.setItem(SERVER_CONFIG_KEY, encrypted)
  localStorage.setItem(SERVER_CONFIG_IV_KEY, iv)

  configMemoryCache = config
}

export async function clearApiConfig(): Promise<void> {
  await deleteConfigFromServer()

  localStorage.removeItem(SERVER_CONFIG_KEY)
  localStorage.removeItem(SERVER_CONFIG_IV_KEY)
  configMemoryCache = null
}

export async function hasStoredApiConfig(): Promise<boolean> {
  const cfg = await getStoredApiConfig()
  return !!cfg?.baseUrl && !!cfg?.apiKey && !!cfg?.model
}

export function clearConfigCache(): void {
  configMemoryCache = null
}
