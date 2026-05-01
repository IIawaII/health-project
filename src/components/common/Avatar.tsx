import { getAvatarDisplayUrl, isSpriteMode } from '@/utils/avatar'

interface AvatarProps {
  avatar?: string | null
  size?: number | string
  className?: string
  alt?: string
}

export default function Avatar({ avatar, size = 32, className = '', alt = 'avatar' }: AvatarProps) {
  const url = getAvatarDisplayUrl(avatar)

  if (isSpriteMode()) {
    return (
      <svg
        className={`rounded-full overflow-hidden ${className}`}
        width={size}
        height={size}
        viewBox="0 0 128 128"
        role="img"
        aria-label={alt}
      >
        <use href={url} />
      </svg>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
      onError={(e) => {
        const target = e.currentTarget
        target.onerror = null
        target.src = '/User/default.svg'
      }}
    />
  )
}
