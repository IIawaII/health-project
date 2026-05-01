const PBKDF2_ITERATIONS = 100_000
const SALT_LENGTH = 16
const KEY_LENGTH = 32

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function hashPassword(password) {
  const encoder = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt.buffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8,
  )
  return `${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(hashBuffer)}`
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log('用法: node scripts/hash-password.mjs <密码>')
    console.log('')
    console.log('示例:')
    console.log('  node scripts/hash-password.mjs "MyStr0ngP@ss!"')
    console.log('')
    console.log('输出格式: iterations:salt:hash')
    console.log('将输出值设置为 ADMIN_PASSWORD 环境变量即可')
    process.exit(1)
  }

  const password = args[0]

  if (password.length < 8) {
    console.error('错误: 密码长度至少 8 位')
    process.exit(1)
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    console.error('错误: 密码必须同时包含字母和数字')
    process.exit(1)
  }

  const hash = await hashPassword(password)
  console.log('')
  console.log('密码哈希生成成功!')
  console.log('')
  console.log(`ADMIN_PASSWORD=${hash}`)
  console.log('')
  console.log('请将此值设置到:')
  console.log('  本地开发: .dev.vars 文件中的 ADMIN_PASSWORD')
  console.log('  生产环境: GitHub Secrets 中的 ADMIN_PASSWORD')
}

main().catch((err) => {
  console.error('生成失败:', err.message)
  process.exit(1)
})
