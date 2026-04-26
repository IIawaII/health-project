interface LogoIconProps {
  className?: string
}

export default function LogoIcon({ className = 'w-9 h-9' }: LogoIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="logoCloudLight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4FACFE" />
          <stop offset="100%" stopColor="#00F2FE" />
        </linearGradient>
        <linearGradient id="logoCloudDark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#82CFFF" />
          <stop offset="100%" stopColor="#66FFFF" />
        </linearGradient>
      </defs>
      {/* 云朵 - 亮色模式 */}
      <path
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        className="fill-[url(#logoCloudLight)] dark:hidden"
      />
      {/* 云朵 - 暗色模式 */}
      <path
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        className="hidden dark:block fill-[url(#logoCloudDark)]"
      />
      {/* 十字 - 亮色模式 */}
      <rect x="10" y="6" width="4" height="12" rx="1.5" className="fill-white dark:hidden" />
      <rect x="6" y="10" width="12" height="4" rx="1.5" className="fill-white dark:hidden" />
      {/* 十字 - 暗色模式 */}
      <rect x="10" y="6" width="4" height="12" rx="1.5" className="hidden dark:block fill-[#E0F0FF]" />
      <rect x="6" y="10" width="12" height="4" rx="1.5" className="hidden dark:block fill-[#E0F0FF]" />
    </svg>
  )
}
