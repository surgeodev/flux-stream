import { useRef, useState, useCallback } from 'react'
import { Link } from 'wouter'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MediaCard } from '@/components/media-card'
import { PosterImage } from '@/components/poster-image'
import { Skeleton } from '@/components/ui/skeleton'
import { imgPath, type MediaItem } from '@/hooks/use-tmdb'

export function MediaRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="container mx-auto px-4 md:px-6 py-6 md:py-8">
      <Skeleton className="h-6 md:h-7 w-44 md:w-56 mb-4 md:mb-5" />
      <div className="flex gap-3 md:gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-36 md:w-48">
            <Skeleton className="aspect-[2/3] w-full rounded-xl" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function MediaRow({
  title,
  items,
  rank = false,
  onMore,
  progressLabels,
  progressValues,
  hrefs,
  tint,
  icon,
  subtitle,
}: {
  title: string
  items: MediaItem[]
  rank?: boolean
  onMore?: () => void
  progressLabels?: string[]
  progressValues?: number[]
  hrefs?: string[]
  tint?: { hue: number; label: string }
  icon?: React.ReactNode
  subtitle?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  const update = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setCanLeft(el.scrollLeft > 10)
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }, [])

  const scrollBy = useCallback((dir: number) => {
    const el = scroller.current
    if (!el) return
    const card = 200
    el.scrollBy({ left: dir * card * 3, behavior: 'smooth' })
  }, [])

  if (!items.length) return null

  return (
    <section className="relative container mx-auto px-4 md:px-6 py-4 md:py-6">
      {tint && (
        <div className="pointer-events-none absolute -inset-x-10 -inset-y-6 overflow-hidden" aria-hidden>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[80%] rounded-full blur-[90px] opacity-[0.04]"
            style={{ background: `hsl(${tint.hue} 80% 50%)` }} />
        </div>
      )}

      <div className="relative flex items-end justify-between mb-3 md:mb-5">
        <div className="flex items-center gap-3">
          {icon && (
            <span className="text-primary/80 shrink-0 [&_svg]:w-5 [&_svg]:h-5 md:[&_svg]:w-6 md:[&_svg]:h-6">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="section-accent w-1 h-4 md:h-5 rounded-full bg-primary/80" />
              <h2 className="text-base md:text-xl font-bold font-display tracking-tight text-white leading-tight">
                {title}
              </h2>
            </div>
            {subtitle && <p className="text-[11px] md:text-xs text-muted-foreground leading-none mt-1 pl-3.5">{subtitle}</p>}
          </div>
        </div>
        {onMore && (
          <button onClick={onMore} className="text-xs md:text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
            Tout voir &rarr;
          </button>
        )}
      </div>

      <div className="group/row relative -mx-1">
        <div
          ref={scroller}
          onScroll={update}
          className="flex gap-3 md:gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 px-1"
          style={{ scrollbarWidth: 'none' }}
        >
          {items.map((item, i) => (
            <div
              key={`${item.type}-${item.id}`}
              className={cn(
                'flex-shrink-0 snap-start transition-all duration-300',
                rank ? 'w-36 md:w-52' : 'w-36 md:w-48',
                'hover:z-10 hover:scale-[1.06] hover:shadow-xl hover:shadow-black/50'
              )}
            >
              {rank ? (
                <Link href={item.type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`} className="flex items-end gap-2 md:gap-3 group/item">
                  <span
                    className="font-display font-extrabold leading-[0.8] text-transparent bg-clip-text bg-gradient-to-b from-white/85 to-white/5 select-none w-[2ch] text-right"
                    style={{ fontSize: 'min(9vw, 110px)', backgroundImage: 'linear-gradient(to bottom, hsl(348 80% 68%), hsl(348 70% 35%))' }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 transition-transform duration-300 group-hover/item:scale-105">
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-card border border-white/5">
                      <PosterImage src={imgPath(item.img)} alt={item.title} placeholder={item.title} className="absolute inset-0" imgClassName="transition-transform duration-500 group-hover/item:scale-110" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover/item:opacity-100 transition-opacity" />
                    </div>
                  </div>
                </Link>
              ) : (
                <MediaCard item={item} progressLabel={progressLabels?.[i]} progress={progressValues?.[i]} href={hrefs?.[i]} />
              )}
            </div>
          ))}
        </div>

        {canLeft && (
          <button
            onClick={() => scrollBy(-1)}
            aria-label="Précédent"
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 md:-translate-x-4 z-20 w-10 md:w-12 h-14 md:h-20 bg-black/70 hover:bg-primary/90 backdrop-blur border border-white/10 rounded-r-xl flex items-center justify-center text-white opacity-0 group-hover/row:opacity-100 transition-all shadow-xl"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {canRight && (
          <button
            onClick={() => scrollBy(1)}
            aria-label="Suivant"
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 md:translate-x-4 z-20 w-10 md:w-12 h-14 md:h-20 bg-black/70 hover:bg-primary/90 backdrop-blur border border-white/10 rounded-l-xl flex items-center justify-center text-white opacity-0 group-hover/row:opacity-100 transition-all shadow-xl"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </section>
  )
}
