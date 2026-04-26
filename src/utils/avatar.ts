// 本地用户头像列表（public/User 文件夹下的 SVG）
export const AVATAR_LIST = Array.from({ length: 51 }, (_, i) => `User_${i + 1}`)

/** 合法头像名称白名单 */
const ALLOWED_AVATAR_NAMES = new Set(AVATAR_LIST)

// 将字符串哈希为 1~max 的整数
function hashToIndex(str: string, max: number): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return (Math.abs(hash) % max) + 1
}

/**
 * 获取用户头像 URL
 * 严格限制只能使用预定义的本地 SVG 头像文件
 */
export function getUserAvatarUrl(avatar?: string | null): string {
  // 严格白名单校验：只允许预定义的 User_X 格式
  if (avatar && ALLOWED_AVATAR_NAMES.has(avatar)) {
    return `/User/${avatar}.svg`
  }
  // 任何非法输入都回退到默认头像
  const seed = avatar || 'default'
  const index = hashToIndex(seed, AVATAR_LIST.length)
  return `/User/User_${index}.svg`
}

/**
 * 获取用户头像显示 URL
 * 安全策略：
 * 1. 只允许使用预定义的本地 SVG 头像
 * 2. 完全禁止 base64 data URL、外部 URL 等任意字符串
 * 3. 所有非法输入强制回退到本地默认头像
 */
export function getAvatarDisplayUrl(avatar?: string | null): string {
  // 严格白名单校验：只允许预定义的 User_X 格式
  if (avatar && ALLOWED_AVATAR_NAMES.has(avatar)) {
    return `/User/${avatar}.svg`
  }
  // 任何非法输入（包括 data URL、外部 URL、恶意字符串）都回退到默认头像
  return getUserAvatarUrl(avatar)
}
