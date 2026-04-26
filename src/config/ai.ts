import type { ApiConfig } from '@/types'

const STORAGE_KEY = 'health_ai_config_enc'

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

async function encryptApiConfigData(config: ApiConfig, dataKey: string): Promise<string> {
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

  return bytesToBase64(combined)
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
  return localStorage.getItem('user_data_key')
}

export async function getStoredApiConfig(): Promise<ApiConfig | null> {
  const dataKey = getDataKey()
  if (!dataKey) return null

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  return decryptApiConfigData(raw, dataKey)
}

export async function saveApiConfig(config: ApiConfig): Promise<void> {
  const dataKey = getDataKey()
  if (!dataKey) {
    throw new Error('未找到数据密钥，请先登录')
  }
  const encrypted = await encryptApiConfigData(config, dataKey)
  localStorage.setItem(STORAGE_KEY, encrypted)
}

export function clearApiConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export async function hasStoredApiConfig(): Promise<boolean> {
  const cfg = await getStoredApiConfig()
  return !!cfg?.baseUrl && !!cfg?.apiKey && !!cfg?.model
}
