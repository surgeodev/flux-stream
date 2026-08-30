import { Link } from 'wouter'
import { Play, Star, Info, Heart, ListPlus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, truncateText } from '@/lib/utils'
import { imgPath, type MediaItem } from '@/hooks/use-tmdb'
import { PosterImage } from '@/components/poster-image'
import { usePlaylist } from '@/hooks/use-playlist'
import { useProfile } from '@/hooks/use-profile'
import { useToast } from '@/components/ui/use-toast'

export function MediaCard({ item, className, progressLabel, progress, href: hrefOverride, showAddButton = true }: { item: MediaItem; className?: string; progressLabel?: string; progress?: number; href?: string; showAddButton?: boolean }) {
  const href = hrefOverride || (item.type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`)
  const poster = imgPath(item.img)
  const { added, toggle } = usePlaylist(item)
  const { toast } = useToast()
  const { profile, toggleLike } = useProfile()
  const liked = (profile?.likes || []).some(l => l.type === item.type && l.id === item.id)

  const onLike = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const willLike = !liked
    await toggleLike({ type: item.type, id: item.id, title: item.title, img: item.img || '' })
    toast({
      title: willLike ? 'J\'aime ajouté' : 'J\'aime retiré',
      description: item.title,
      variant: willLike ? 'success' : 'default',
    })
  }

  const onTogglePlaylist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggle()
    toast({
      title: added ? 'Retiré de la playlist' : 'Ajouté à la playlist',
      description: item.title,
      variant: added ? 'default' : 'success',
    })
  }

  return (
    <div className="h-full">
      <Link href={href} className={cn('group relative flex flex-col gap-2 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary h-full block', className)}>
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-card border border-white/5 flex-shrink-0 transition-all duration-300 group-hover:border-primary/40 group-hover:shadow-[0_10px_40px_-8px_hsl(var(--primary)/0.35)]">
          <PosterImage src={poster} alt={item.title} placeholder={item.title} className="absolute inset-0" imgClassName="transition-transform duration-500 group-hover:scale-110" />

          {/* Hover overlay - Netflix style */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 md:p-4">
            <p className="text-[11px] md:text-xs text-white/60 line-clamp-3 mb-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
              {truncateText(item.overview || 'Aucune description disponible.', 110)}
            </p>
            <div className="flex items-center gap-2 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 delay-75">
              <span className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-primary text-white flex items-center justify-center shadow-[0_0_18px_hsl(var(--primary)/0.6)] transition-transform hover:scale-110">
                <Play className="w-4 h-4 ml-0.5 fill-current" />
              </span>
              <span className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-white/20 backdrop-blur text-white flex items-center justify-center transition-transform hover:scale-110">
                <Info className="w-4 h-4" />
              </span>
            </div>
          </div>

          {item.rating && item.rating >= 6 && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-xs font-semibold border border-white/10">
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
              <span>{item.rating.toFixed(1)}</span>
            </div>
          )}

          {showAddButton && (
            <div className="absolute top-2 left-2 flex items-center gap-2">
              <button
                type="button"
                aria-label={liked ? 'Retirer mon J\'aime' : 'J\'aime ce titre'}
                onClick={onLike}
                title={liked ? 'Retirer mon J\'aime' : 'J\'aime ce titre'}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full backdrop-blur-md border border-white/15 transition-all',
                  liked ? 'bg-primary text-white shadow-[0_0_14px_hsl(var(--primary)/0.6)]' : 'bg-black/50 text-white hover:bg-primary/80',
                  'md:opacity-0 md:group-hover:opacity-100'
                )}
              >
                <Heart className={cn('w-4 h-4', liked && 'fill-current')} />
              </button>
              <button
                type="button"
                aria-label={added ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
                onClick={onTogglePlaylist}
                title={added ? 'Retirer de ma playlist' : 'Ajouter à ma playlist'}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full backdrop-blur-md border border-white/15 transition-all',
                  added ? 'bg-primary text-white shadow-[0_0_14px_hsl(var(--primary)/0.6)]' : 'bg-black/50 text-white hover:bg-primary/80',
                  'md:opacity-0 md:group-hover:opacity-100'
                )}
              >
                <ListPlus className={cn('w-4 h-4', added && 'fill-current')} />
              </button>
            </div>
          )}

          {progressLabel && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2 py-1 rounded-md border border-primary/30">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] md:text-[11px] font-semibold text-primary">{progressLabel}</span>
            </div>
          )}

          {progress != null && progress > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 mt-1 flex-1 px-0.5">
          <h3 className="font-semibold text-sm line-clamp-1 group-hover:text-primary transition-colors leading-tight" title={item.title}>
            {truncateText(item.title, 40)}
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto pt-1">
            <span>{item.type === 'tv' ? 'Série' : 'Film'}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            {item.year > 0 && <span>{item.year}</span>}
          </div>
        </div>
      </Link>
    </div>
  )
}

export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 h-full">
      <Skeleton className="aspect-[2/3] w-full rounded-xl flex-shrink-0" />
      <Skeleton className="h-4 w-3/4 mt-1" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}
