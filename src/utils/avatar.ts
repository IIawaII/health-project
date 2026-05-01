export const AVATAR_LIST = Array.from({ length: 51 }, (_, i) => `User_${i + 1}`)

const ALLOWED_AVATAR_NAMES = new Set(AVATAR_LIST)

const USE_SPRITE = true

function hashToIndex(str: string, max: number): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return (Math.abs(hash) % max) + 1
}

export function getUserAvatarUrl(avatar?: string | null): string {
  if (avatar && ALLOWED_AVATAR_NAMES.has(avatar)) {
    return USE_SPRITE ? `/avatar-sprite.svg#${avatar}` : `/User/${avatar}.svg`
  }
  const seed = avatar || 'default'
  const index = hashToIndex(seed, AVATAR_LIST.length)
  return USE_SPRITE ? `/avatar-sprite.svg#User_${index}` : `/User/User_${index}.svg`
}

export function getAvatarDisplayUrl(avatar?: string | null): string {
  if (avatar && ALLOWED_AVATAR_NAMES.has(avatar)) {
    return USE_SPRITE ? `/avatar-sprite.svg#${avatar}` : `/User/${avatar}.svg`
  }
  return getUserAvatarUrl(avatar)
}

export function isSpriteMode(): boolean {
  return USE_SPRITE
}
