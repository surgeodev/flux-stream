import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProfile, useLikers, type LikeInfo } from '@/hooks/use-profile'
import { AvatarCircle } from '@/components/profile-picker'
import type { MediaItem } from '@/hooks/use-tmdb'

export function LikeButton({ item, showText = true, className }: { item: MediaItem; showText?: boolean; className?: string }) {
  const { profile, toggleLike } = useProfile()
  const { likers, refresh } = useLikers(item.type, item.id, Boolean(profile?.name))
  const [liked, setLiked] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setLiked(likers.some(l => profile && l.uid === profile.uid))
  }, [likers, profile])

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      const now = await toggleLike({ type: item.type, id: item.id, title: item.title, img: item.img || '' })
      setLiked(now)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const otherLikers = likers.filter(l => !(profile && l.uid === profile.uid))

  return (
    <button
      onClick={onClick}
      title={liked ? 'Retirer mon J\'aime' : 'J\'aime ce titre'}
      className={cn(
        'group inline-flex items-center gap-2.5 backdrop-blur transition-all active:scale-95 border text-sm md:text-base font-semibold rounded-xl py-2.5 md:py-3',
        className || 'px-6 md:px-8',
        liked
          ? 'bg-primary/20 text-primary border-primary/40 shadow-[0_0_25px_hsl(var(--primary)/0.35)]'
          : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
      )}
    >
      <Heart className={cn('w-4 h-4 md:w-5 md:h-5 transition-transform group-hover:scale-110', liked && 'fill-current')} />
      {showText && <span className="hidden sm:inline">{liked ? 'J\'aime' : 'J\'aimer'}</span>}
      {otherLikers.length > 0 && (
        <span className="flex items-center -space-x-2 ml-1">
          {otherLikers.slice(0, 4).map(l => (
            <AvatarCircle key={l.uid} name={l.name} avatar={l.avatar} size="sm" />
          ))}
        </span>
      )}
      {otherLikers.length > 4 && (
        <span className="text-[10px] font-bold text-white/50">+{otherLikers.length - 4}</span>
      )}
    </button>
  )
}

export function LikersBubble({ likers }: { likers: LikeInfo[] }) {
  if (likers.length === 0) return null
  return (
    <div className="flex items-center gap-2 mt-3">
      <div className="flex items-center -space-x-2">
        {likers.slice(0, 6).map(l => (
          <AvatarCircle key={l.uid} name={l.name} avatar={l.avatar} size="sm" />
        ))}
      </div>
      <p className="text-xs text-white/50">
        {likers.length === 1 ? `${likers[0].name} aime ce titre` : `${likers.length} personnes aiment ce titre`}
      </p>
    </div>
  )
}