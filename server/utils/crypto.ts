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
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(':')
  if (parts.length !== 3) return false

  const [iterationsStr, saltHex, hashHex] = parts
  const iterations = parseInt(iterationsStr, 10)
  if (isNaN(iterations) || iterations < 1) return false

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

  return toHex(hashBuffer) === hashHex
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
