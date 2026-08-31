import { cn } from '@/lib/utils'
import { AVATAR_COLORS } from '@/hooks/use-profile'

export function AvatarCircle({ name, avatar, size = 'md' }: { name?: string; avatar?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeCls = size === 'lg' ? 'w-12 h-12 text-xl' : size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  const src = (avatar || '').trim()

  if (src.startsWith('/') || src.startsWith('http')) {
    return (
      <span className={cn('relative inline-flex flex-shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/5', sizeCls)}>
        <img src={src} alt={name || 'avatar'} className="w-full h-full object-cover" />
      </span>
    )
  }

  const initial = (name || '?').charAt(0).toUpperCase()
  const color = AVATAR_COLORS[hashStr(name || avatar || '') % AVATAR_COLORS.length]
  return (
    <span className={cn('flex items-center justify-center rounded-full border border-white/15 font-bold text-white select-none', sizeCls)} style={{ background: color }}>
      {initial}
    </span>
  )
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100000
  return h
}