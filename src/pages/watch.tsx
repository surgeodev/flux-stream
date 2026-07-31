import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearch, Link } from 'wouter'
import { ChevronLeft, ChevronRight, Star, Monitor, Maximize, Minimize, Shuffle, Play, Clock, Calendar, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMovie, getTVShow, getCatalog, getTrending, bgPath, imgPath, type MediaItem } from '@/hooks/use-tmdb'
import { useStream } from '@/hooks/use-stream'
import { MediaCard } from '@/components/media-card'
import { VideoPlayer } from '@/components/video-player'

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setMatches(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return matches
}

export default function Watch() {
  const searchString = useSearch()
  const params = new URLSearchParams(searchString)
  const type = params.get('type') || 'movie'
  const id = params.get('id') || params.get('tmdb')
  const title = params.get('title') || ''
  const s = Number(params.get('s')) || 1
  const e = Number(params.get('e')) || 1

  const { iframeUrl, hlsUrl, sourceName, sources, activeIdx, loading, error, fetchStream, switchSource } = useStream()
  const [media, setMedia] = useState<MediaItem | null>(null)
  const [related, setRelated] = useState<MediaItem[]>([])
  const [pageLoading, setPageLoading] = useState(true)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const playerBoxRef = useRef<HTMLDivElement>(null)
  const isSmallLandscape = useMediaQuery('(orientation: landscape) and (max-height: 700px)')

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
    setPageLoading(true)
    setShowSuggestions(false)

    Promise.all([
      type === 'movie' ? getMovie(Number(id)) : getTVShow(Number(id)),
      getTrending(),
      getCatalog(),
    ]).then(([m, trending, cat]) => {
      setMedia(m ?? null)
      const seen = new Set([Number(id)])
      const mixed = [...trending, ...cat]
        .filter(item => !seen.has(item.id) && seen.add(item.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, 10)
      setRelated(mixed)
      setPageLoading(false)
    })

    if (id) fetchStream(type, id, s, e)
  }, [id, type, s, e])

  const shuffleRelated = useCallback(() => {
    setRelated(prev => [...prev].sort(() => Math.random() - 0.5))
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      playerBoxRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  const isReady = (iframeUrl || hlsUrl) && !loading && !pageLoading
  const backdropUrl = media?.backdrop ? bgPath(media.backdrop) : null
  const posterUrl = media?.img ? imgPath(media.img) : null

  if (!id) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Paramètres manquants</p>
      </div>
    )
  }

  const playerContent = (
    <>
      {isReady && iframeUrl ? (
        <iframe
          key={`${activeIdx}-${id}-${s}-${e}`}
          src={iframeUrl}
          className="absolute inset-0 w-full h-full border-0 bg-black"
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : isReady && hlsUrl ? (
        <VideoPlayer hlsUrl={hlsUrl} tmdbId={Number(id)} mediaType={type} title={media?.title} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          {backdropUrl && (
            <img src={backdropUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
          )}
          <div className="relative z-10 flex flex-col items-center gap-3">
            {loading || pageLoading ? (
              <div className="w-10 h-10 border-2 border-primary/30 border-t-transparent rounded-full animate-spin" />
            ) : (
              <p className="text-sm text-muted-foreground/60">{error || 'Aucun flux'}</p>
            )}
          </div>
        </div>
      )}
    </>
  )

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* ===== Player (sticky top) ===== */}
      <div ref={playerBoxRef}
        className={cn('relative w-full bg-black overflow-hidden', isFullscreen && 'min-h-dvh flex items-center justify-center')}>
        <div className={cn('relative w-full', !isFullscreen && 'aspect-video', isSmallLandscape && !isFullscreen && 'max-h-[52dvh]')}>
          {playerContent}

          {/* Back button overlay */}
          {!isFullscreen && (
            <Link
              href={type === 'movie' ? `/movie/${id}` : `/tv/${id}`}
              className="absolute top-3 left-3 z-20 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/90 hover:text-white border border-white/10 transition-all backdrop-blur-md"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
          )}

          {/* Fullscreen toggle */}
          <button onClick={toggleFullscreen}
            className="absolute top-3 right-3 z-20 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/90 hover:text-white border border-white/10 transition-all backdrop-blur-md">
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <main className={cn('mx-auto px-4 md:px-6 w-full', isFullscreen ? 'hidden' : 'max-w-5xl py-5 md:py-8 space-y-7 md:space-y-9')}>
        {/* ===== Title + meta ===== */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight leading-tight">
              {media?.title || title}
            </h1>
            {media?.rating ? (
              <span className="flex items-center gap-1 text-sm md:text-base font-semibold text-yellow-400">
                <Star className="w-4 h-4 fill-current" />
                {media.rating.toFixed(1)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm text-muted-foreground">
            {media?.year ? (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {media.year}
              </span>
            ) : null}
            {type === 'tv' && media?.seasons ? (
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" />
                {media.seasons} saisons
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {type === 'movie' ? 'Film' : `Saison ${s} · Épisode ${e}`}
            </span>
            {media?.genres?.map(g => (
              <span key={g}
                className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/70">
                {g}
              </span>
            ))}
          </div>
        </section>

        {/* ===== Sources selector (always visible) ===== */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Sources</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {sources.map((src, i) => (
              <button key={i}
                onClick={() => switchSource(i)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border backdrop-blur-sm',
                  i === activeIdx
                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/25 scale-[1.02]'
                    : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                )}>
                <span className={cn('w-1.5 h-1.5 rounded-full', i === activeIdx ? 'bg-white' : 'bg-white/25')} />
                {src.name}
                {i === activeIdx && <Play className="w-3.5 h-3.5 fill-current" />}
              </button>
            ))}
            {sources.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground/60">{error || 'Aucune source disponible'}</p>
            )}
          </div>
        </section>

        {/* ===== Overview ===== */}
        {media?.overview && (
          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Synopsis</h2>
            <p className="text-sm md:text-base text-white/70 leading-relaxed max-w-3xl">{media.overview}</p>
          </section>
        )}

        {/* ===== TV episode nav ===== */}
        {type === 'tv' && (
          <section className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Épisodes</h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${Math.max(1, e - 1)}`}
                className={cn(
                  'flex items-center gap-1.5 text-sm bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-xl transition-all text-white/80 hover:text-white',
                  e <= 1 && 'opacity-30 pointer-events-none'
                )}>
                <ChevronLeft className="w-4 h-4" />
                Épisode {Math.max(1, e - 1)}
              </Link>
              <span className="text-sm font-bold text-white/90 px-2 py-2.5 bg-primary/10 border border-primary/20 rounded-xl min-w-[64px] text-center">
                S{s}·E{e}
              </span>
              <Link
                href={`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${e + 1}`}
                className="flex items-center gap-1.5 text-sm bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-xl transition-all text-white/80 hover:text-white">
                Épisode {e + 1}
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        )}

        {/* ===== Suggestions ===== */}
        {related.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Suggestions
              </h2>
              <button onClick={shuffleRelated}
                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/90 transition-colors">
                <Shuffle className="w-3.5 h-3.5" />
                Mélanger
              </button>
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin snap-x">
              {related.map(m => (
                <div key={m.id} className="flex-shrink-0 w-32 md:w-44 snap-start">
                  <MediaCard item={m} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ===== Poster + footer credits ===== */}
        {posterUrl && (
          <section className="flex items-center gap-4 pt-2 border-t border-white/5">
            <img src={posterUrl} alt="" className="w-14 h-20 md:w-16 md:h-24 object-cover rounded-lg border border-white/10" />
            <div className="space-y-1 min-w-0">
              <p className="text-sm font-semibold truncate">{media?.title}</p>
              <p className="text-xs text-muted-foreground">
                {type === 'movie' ? 'Film' : 'Série'} · {media?.year || ''}
                {media?.rating ? ` · ${media.rating.toFixed(1)}/10` : ''}
              </p>
              <p className="text-xs text-white/40">Proposé par FLUX · {sourceName || ''}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
