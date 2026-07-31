import { Link } from 'wouter'
import { Play, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, truncateText } from '@/lib/utils'
import { imgPath, type MediaItem } from '@/hooks/use-tmdb'

export function MediaCard({ item, className }: { item: MediaItem; className?: string }) {
  const href = item.type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`
  const poster = imgPath(item.img)
  const [imgError, setImgError] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="h-full"
    >
      <Link href={href} className={cn('group relative flex flex-col gap-2 rounded-lg overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary h-full block', className)}>
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-card border border-white/5 flex-shrink-0">
          {imgError ? (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-card to-muted">
              <span className="text-3xl md:text-4xl font-bold text-muted-foreground/30">{item.title.charAt(0)}</span>
            </div>
          ) : (
            <img
              src={poster}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100" />

          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-12 h-12 rounded-full bg-primary/90 text-white flex items-center justify-center backdrop-blur-md shadow-[0_0_20px_hsl(var(--primary)/0.5)] transform translate-y-4 group-hover:translate-y-0 transition-all duration-300">
              <Play className="w-5 h-5 ml-1 fill-current" />
            </div>
          </div>

          {item.rating && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-1 rounded-md text-xs font-semibold border border-white/10">
              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
              <span>{item.rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 mt-1 flex-1">
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors leading-tight" title={item.title}>
            {truncateText(item.title, 40)}
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto pt-1">
            <span>{item.type === 'tv' ? 'Série' : 'Film'}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            {item.year > 0 && <span>{item.year}</span>}
            {item.seasons ? <><span className="w-1 h-1 rounded-full bg-muted-foreground/50" /><span>{item.seasons} saisons</span></> : null}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 h-full">
      <Skeleton className="aspect-[2/3] w-full rounded-lg flex-shrink-0" />
      <Skeleton className="h-4 w-3/4 mt-1" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}
