import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearch, Link } from 'wouter'
import { ChevronLeft, ChevronRight, Star, Monitor, Maximize, Shuffle, Calendar, Clapperboard, Tv } from 'lucide-react'
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
  const isIframe = Boolean(iframeUrl)

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
      {/* ===== Hero / Player ===== */}
      <div className="relative">
        {backdropUrl && !isFullscreen && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <img src={backdropUrl} alt="" className="w-full h-full object-cover opacity-[0.14]" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
          </div>
        )}

        <div ref={playerBoxRef} className={cn('relative w-full', isFullscreen && 'min-h-dvh flex items-center justify-center bg-black')}>
          <div className={cn(
            'relative w-full bg-black overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/10',
            isFullscreen
              ? 'min-h-dvh'
              : 'aspect-video md:rounded-2xl md:mt-6 md:max-w-5xl md:mx-auto md:ring-white/5',
            isSmallLandscape && !isFullscreen && 'max-h-[52dvh] rounded-none mt-0 max-w-full'
          )}>
            {playerContent}

            {/* Back button */}
            <Link
              href={type === 'movie' ? `/movie/${id}` : `/tv/${id}`}
              className="absolute top-3 left-3 z-20 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white border border-white/15 transition-all backdrop-blur-md"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>

            {/* Fullscreen — only for iframes (VideoPlayer has its own) */}
            {isIframe && (
              <button onClick={toggleFullscreen}
                className="absolute top-3 right-3 z-20 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white border border-white/15 transition-all backdrop-blur-md">
                {isFullscreen ? <ChevronLeft className="w-4 h-4 rotate-45" /> : <Maximize className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      <main className={cn('mx-auto w-full px-5 md:px-6', isFullscreen ? 'hidden' : 'max-w-5xl pb-20')}>
        {/* ===== Title + meta ===== */}
        <section className="pt-6 md:pt-10">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight text-white">
            {media?.title || title}
          </h1>

          <div className="mt-3 md:mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-white/45">
            {media?.rating ? (
              <span className="flex items-center gap-1.5 font-semibold text-amber-400/90">
                <Star className="w-4 h-4 fill-current" />
                {media.rating.toFixed(1)}
                <span className="text-white/25 font-normal">/10</span>
              </span>
            ) : null}
            {media?.year ? (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                {media.year}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5 capitalize">
              {type === 'movie' ? <Clapperboard className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
              {type === 'movie' ? 'Film' : `Saison ${s} · Épisode ${e}`}
            </span>
            {media?.genres?.slice(0, 3).map(g => (
              <span key={g} className="text-white/35">{g}</span>
            ))}
          </div>
        </section>

        {/* ===== Sources ===== */}
        <section className="mt-7 md:mt-9">
          <div className="flex items-center gap-2 mb-3">
            <Monitor className="w-4 h-4 text-white/40" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Sources</h2>
            <span className="h-px flex-1 bg-white/5" />
          </div>
          <div className="flex flex-wrap gap-2">
            {sources.map((src, i) => (
              <button key={i}
                onClick={() => switchSource(i)}
                className={cn(
                  'group flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 border',
                  i === activeIdx
                    ? 'bg-primary/90 text-white border-primary shadow-lg shadow-primary/20 scale-[1.03]'
                    : 'bg-white/[0.04] text-white/55 border-white/10 hover:bg-white/[0.09] hover:text-white hover:border-white/20'
                )}>
                <span className={cn('w-1.5 h-1.5 rounded-full transition-colors', i === activeIdx ? 'bg-white' : 'bg-white/20 group-hover:bg-white/50')} />
                {src.name}
              </button>
            ))}
            {sources.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground/60">{error || 'Aucune source disponible'}</p>
            )}
          </div>
        </section>

        {/* ===== Overview ===== */}
        {media?.overview && (
          <section className="mt-8 md:mt-10 max-w-2xl">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40 mb-3">Synopsis</h2>
            <p className="text-[15px] leading-relaxed text-white/65">{media.overview}</p>
          </section>
        )}

        {/* ===== TV episode nav ===== */}
        {type === 'tv' && (
          <section className="mt-8 md:mt-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40 mb-3">Épisodes</h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${Math.max(1, e - 1)}`}
                className={cn(
                  'flex items-center gap-1.5 text-[13px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 px-4 py-2 rounded-full transition-all text-white/60 hover:text-white',
                  e <= 1 && 'opacity-25 pointer-events-none'
                )}>
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </Link>
              <span className="text-sm font-semibold text-white/90 px-3 py-2 bg-white/[0.06] border border-white/10 rounded-full min-w-[72px] text-center">
                S{s}·E{e}
              </span>
              <Link
                href={`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${e + 1}`}
                className="flex items-center gap-1.5 text-[13px] bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 px-4 py-2 rounded-full transition-all text-white/60 hover:text-white">
                Suivant
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        )}

        {/* ===== Suggestions ===== */}
        {related.length > 0 && (
          <section className="mt-10 md:mt-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Suggestions
              </h2>
              <button onClick={shuffleRelated}
                className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/80 transition-colors">
                <Shuffle className="w-3.5 h-3.5" />
                Mélanger
              </button>
            </div>
            <div className="flex gap-3 md:gap-4 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-thin snap-x">
              {related.map(m => (
                <div key={m.id} className="flex-shrink-0 w-32 md:w-44 snap-start">
                  <MediaCard item={m} />
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
