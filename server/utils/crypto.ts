/**
 * 安全密码哈希模块
 * 使用 PBKDF2 + 随机 Salt + 高迭代次数（100,000）
 */

const PBKDF2_ITERATIONS = 100_000
const SALT_LENGTH = 16
const KEY_LENGTH = 32

function toHex(bytes: Uint8Array | ArrayBuffer): string {
  const array = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g)
  if (!pairs) throw new Error('Invalid hex string')
  return new Uint8Array(pairs.map((b) => parseInt(b, 16)))
}

/**
 * 使用 PBKDF2 哈希密码
 * 返回格式: iterations:saltHex:hashHex
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const passwordData = encoder.encode(password)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  )

  return `${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(hashBuffer)}`
}

/**
 * 验证密码
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    a.charCodeAt(0)
    for (let i = 1; i < b.length; i++) a.charCodeAt(i)
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(':')
  if (parts.length !== 3) return false

  const [iterationsStr, saltHex, hashHex] = parts
  const iterations = parseInt(iterationsStr, 10)
  if (isNaN(iterations) || iterations < PBKDF2_ITERATIONS) return false

  let salt: Uint8Array
  try {
    salt = fromHex(saltHex)
  } catch {
    return false
  }

  const encoder = new TextEncoder()
  const passwordData = encoder.encode(password)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits']
  )

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  )

  return timingSafeEqual(toHex(hashBuffer), hashHex)
}

/**
 * 生成随机令牌（64 位十六进制字符串）
 */
export function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 生成用户数据加密密钥（256 位，64 位十六进制字符串）
 * 用于前端 AES-GCM 加密本地存储的 API Key 等敏感配置
 */
export function generateDataKey(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 使用 SHA-256 哈希字符串，返回十六进制字符串
 * 用于验证码等不需要盐值的单向哈希场景
 */
const BACKUP_ENCRYPTION_ITERATIONS = 600_000
const BACKUP_IV_LENGTH = 12
const BACKUP_SALT_LENGTH = 16

function toBase64(bytes: Uint8Array | ArrayBuffer): string {
  const array = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes
  return btoa(String.fromCharCode(...array))
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return array
}

export async function encryptBackupData(plaintext: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(BACKUP_SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(BACKUP_IV_LENGTH))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: BACKUP_ENCRYPTION_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    encoder.encode(plaintext)
  )

  const payload = {
    _encrypted: true,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: BACKUP_ENCRYPTION_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(encrypted),
  }

  return JSON.stringify(payload)
}

export async function decryptBackupData(encryptedJson: string, password: string): Promise<string> {
  const payload = JSON.parse(encryptedJson) as {
    _encrypted?: boolean
    alg?: string
    kdf?: string
    iterations?: number
    salt?: string
    iv?: string
    ciphertext?: string
  }

  if (!payload._encrypted || !payload.salt || !payload.iv || !payload.ciphertext || !payload.iterations) {
    throw new Error('Invalid encrypted backup format')
  }

  if (payload.alg !== 'AES-256-GCM' || payload.kdf !== 'PBKDF2-SHA256') {
    throw new Error(`Unsupported encryption algorithm: ${payload.alg}`)
  }

  const encoder = new TextEncoder()
  const salt = fromBase64(payload.salt)
  const iv = fromBase64(payload.iv)
  const ciphertext = fromBase64(payload.ciphertext)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: payload.iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ciphertext as BufferSource
  )

  return new TextDecoder().decode(decrypted)
}

export function isEncryptedBackup(jsonStr: string): boolean {
  try {
    const parsed = JSON.parse(jsonStr) as { _encrypted?: boolean }
    return parsed._encrypted === true
  } catch {
    return false
  }
}

export async function sha256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return toHex(hashBuffer)
}
