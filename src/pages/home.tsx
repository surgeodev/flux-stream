import { Layout } from '@/components/layout'
import { Link } from 'wouter'
import { Play, Info, Star, ChevronRight, ChevronLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { MediaCard, MediaCardSkeleton } from '@/components/media-card'
import { getTrending, getCatalog, bgPath, imgPath, type MediaItem } from '@/hooks/use-tmdb'

function HeroCarousel({ items }: { items: MediaItem[] }) {
  const [current, setCurrent] = useState(0)
  const [prevIdx, setPrevIdx] = useState<number | null>(null)
  const [touchStart, setTouchStart] = useState(0)
  const [animKey, setAnimKey] = useState(0)

  const goTo = useCallback((idx: number) => {
    if (idx === current) return
    setPrevIdx(current)
    setCurrent(idx)
    setAnimKey(k => k + 1)
  }, [current])

  const prev = () => goTo((current - 1 + items.length) % items.length)
  const next = useCallback(() => goTo((current + 1) % items.length), [current, items.length, goTo])

  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(next, 6000)
    return () => clearInterval(t)
  }, [next, items.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prev, next])

  const onTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX)
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStart
    if (Math.abs(dx) > 50) dx > 0 ? prev() : next()
  }

  if (!items.length) return <Skeleton className="w-full h-[60vh] md:h-[80vh] rounded-none" />

  const item = items[current]
  const prevItem = prevIdx !== null ? items[prevIdx] : null

  return (
    <div
      className="relative w-full h-[55vh] md:h-[82vh] overflow-hidden bg-black select-none"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Previous slide fading out */}
      {prevItem && (
        <div key={`prev-${animKey}`} className="absolute inset-0 z-10 animate-out pointer-events-none">
          <img src={bgPath(prevItem.backdrop || '')} alt="" className="w-full h-full object-cover scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/40 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-background to-transparent" />
        </div>
      )}

      {/* Current slide fading in */}
      <div key={`cur-${animKey}`} className="absolute inset-0 z-20 animate-in">
        {bgPath(item.backdrop || '') && (
          <img src={bgPath(item.backdrop || '')} alt={item.title} className="w-full h-full object-cover scale-105" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/40 to-transparent" />
      </div>

      {/* Content */}
      <div key={`content-${animKey}`} className="absolute inset-0 z-30 flex items-end md:items-center animate-in">
        <div className="container mx-auto px-4 md:px-12 pb-24 md:pb-0 md:mt-0">
          <div className="max-w-2xl flex flex-col gap-2 md:gap-4">
            {item.genres && item.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 md:gap-2">
                {item.genres.slice(0, 3).map(g => (
                  <span key={g} className="text-[10px] md:text-xs font-semibold uppercase tracking-widest text-primary/80 border border-primary/30 px-1.5 md:px-2 py-0.5 rounded">{g}</span>
                ))}
              </div>
            )}

            <h1 className="text-2xl md:text-6xl font-extrabold font-display text-white leading-tight drop-shadow-2xl">{item.title}</h1>

            <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm font-medium flex-wrap">
              {item.rating && (
                <span className="flex items-center gap-1 text-yellow-400 bg-black/50 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-md backdrop-blur border border-white/10">
                  <Star className="w-3 h-3 md:w-3.5 md:h-3.5 fill-current" />{item.rating.toFixed(1)}
                </span>
              )}
              <span className="bg-white/10 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-md backdrop-blur border border-white/10 uppercase text-[10px] md:text-xs tracking-wide">
                {item.type === 'tv' ? 'Série' : 'Film'}
              </span>
              <span className="bg-white/10 px-1.5 md:px-2.5 py-0.5 md:py-1 rounded-md backdrop-blur border border-white/10 text-[10px] md:text-xs">{item.year}</span>
            </div>

            {item.overview && (
              <p className="text-xs md:text-sm text-white/70 line-clamp-1 md:line-clamp-2 max-w-xl leading-relaxed">{item.overview.slice(0, 120)}&hellip;</p>
            )}

            <div className="flex items-center gap-3 md:gap-4 mt-2 md:mt-4">
              <Link
                href={`/watch?type=${item.type}&id=${item.id}&title=${encodeURIComponent(item.title)}`}
                className="inline-flex items-center gap-1.5 md:gap-2 bg-primary hover:bg-primary/90 text-white px-5 md:px-8 py-2 md:py-3 rounded-full font-bold transition-all hover:scale-105 active:scale-95 shadow-hero text-sm md:text-base"
              >
                <Play className="w-4 h-4 md:w-5 md:h-5 fill-current" />Regarder
              </Link>
              <Link
                href={item.type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`}
                className="inline-flex items-center gap-1.5 md:gap-2 bg-white/10 hover:bg-white/20 text-white px-5 md:px-8 py-2 md:py-3 rounded-full font-semibold backdrop-blur transition-all border border-white/20 text-sm md:text-base"
              >
                <Info className="w-4 h-4 md:w-5 md:h-5" />Détails
              </Link>
            </div>
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <>
          <button onClick={prev} aria-label="Précédent" className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-40 w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/50 hover:bg-black/80 border border-white/20 flex items-center justify-center text-white transition-all hover:scale-110">
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <button onClick={next} aria-label="Suivant" className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-40 w-9 h-9 md:w-10 md:h-10 rounded-full bg-black/50 hover:bg-black/80 border border-white/20 flex items-center justify-center text-white transition-all hover:scale-110">
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </>
      )}

      {items.length > 1 && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-2 z-40">
          {items.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} aria-label={`Aller au slide ${i + 1}`}
              className={cn('transition-all rounded-full', i === current ? 'w-6 h-2 bg-primary shadow-dot' : 'w-2 h-2 bg-white/40 hover:bg-white/70')}
            />
          ))}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 h-28 bg-gradient-to-t from-background to-transparent pointer-events-none z-40" />
    </div>
  )
}

function MediaSection({ title, items, showAll = false }: { title: string; items: MediaItem[]; showAll?: boolean }) {
  const [visible, setVisible] = useState(showAll ? items.length : 6)
  const displayed = items.slice(0, visible)

  return (
    <section className="container mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl md:text-2xl font-bold font-display">{title}</h2>
        {!showAll && items.length > 6 && (
          <button onClick={() => setVisible(prev => prev + 6)}
            className="text-xs md:text-sm text-primary hover:text-primary/80 font-semibold transition-colors">
            Voir plus &rarr;
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-6">
        {displayed.map(item => <MediaCard key={`${item.type}-${item.id}`} item={item} />)}
      </div>
    </section>
  )
}

export default function Home() {
  const [trending, setTrending] = useState<MediaItem[]>([])
  const [movies, setMovies] = useState<MediaItem[]>([])
  const [tvShows, setTVShows] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getTrending(), getCatalog()]).then(([tr, cat]) => {
      setTrending(tr)
      setMovies(cat.filter(m => m.type === 'movie'))
      setTVShows(cat.filter(t => t.type === 'tv'))
      setLoading(false)
    })
  }, [])

  const heroItems = trending.filter(m => m.backdrop || m.img)

  if (loading) {
    return (
      <Layout>
        <Skeleton className="w-full h-[55vh] md:h-[82vh] rounded-none" />
        <section className="container mx-auto px-4 md:px-6 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-6">
            {Array.from({ length: 12 }).map((_, i) => <MediaCardSkeleton key={i} />)}
          </div>
        </section>
      </Layout>
    )
  }

  return (
    <Layout>
      <HeroCarousel items={heroItems} />
      <MediaSection title="Films populaires" items={movies} />
      <MediaSection title="Séries populaires" items={tvShows} />
    </Layout>
  )
}
