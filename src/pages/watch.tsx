import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearch, Link } from 'wouter'
import { ChevronLeft, ChevronRight, Monitor, Maximize, Shuffle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMovie, getTVShow, getCatalog, getTrending, bgPath, type MediaItem } from '@/hooks/use-tmdb'
import { useStream } from '@/hooks/use-stream'
import { MediaCard } from '@/components/media-card'
import { VideoPlayer } from '@/components/video-player'

function useIsSmallLandscape() {
  const [is, setIs] = useState(() => typeof window !== 'undefined'
    && window.matchMedia('(orientation: landscape) and (max-height: 700px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape) and (max-height: 700px)')
    const fn = () => setIs(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return is
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
  const [showSources, setShowSources] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showUi, setShowUi] = useState(true)
  const playerRef = useRef<HTMLDivElement>(null)
  const uiTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isSmallLandscape = useIsSmallLandscape()

  const revealUi = useCallback(() => {
    setShowUi(true)
    clearTimeout(uiTimer.current)
    uiTimer.current = setTimeout(() => setShowUi(false), 4000)
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', revealUi)
    revealUi()
    return () => {
      document.removeEventListener('mousemove', revealUi)
      clearTimeout(uiTimer.current)
    }
  }, [revealUi])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      playerRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  const shuffleRelated = useCallback(() => {
    setRelated(prev => [...prev].sort(() => Math.random() - 0.5))
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

  const isReady = (iframeUrl || hlsUrl) && !loading && !pageLoading
  const backdropUrl = media?.backdrop ? bgPath(media.backdrop) : null

  if (!id) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Paramètres manquants</p>
      </div>
    )
  }

  if (isSmallLandscape) {
    return (
      <div className="relative h-dvh w-screen bg-black select-none flex flex-col">
        {backdropUrl && (
          <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
            <img src={backdropUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div ref={playerRef} className="relative w-full h-[52dvh] flex-shrink-0 z-10 bg-black">
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
              {loading || pageLoading ? (
                <div className="w-9 h-9 border-2 border-primary/30 border-t-transparent rounded-full animate-spin" />
              ) : (
                <p className="text-sm text-muted-foreground/60">{error || 'Aucun flux'}</p>
              )}
            </div>
          )}
        </div>

        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto bg-black/80 backdrop-blur-sm px-3 py-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <Link
              href={type === 'movie' ? `/movie/${id}` : `/tv/${id}`}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/80 hover:text-white border border-white/10 transition-all hover:bg-white/20"
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            {media && (
              <h1 className="text-sm font-semibold text-white/90 truncate flex-1 min-w-0 text-center">
                {media.title}
                {media.year && <span className="text-white/40 font-normal ml-1.5">{media.year}</span>}
              </h1>
            )}
            {sources.length > 1 && (
              <div className="relative">
                <button onClick={() => setShowSources(!showSources)}
                  className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 border border-white/10 px-2.5 py-1.5 rounded-full transition-all text-white/80 hover:text-white">
                  <Monitor className="w-3 h-3" />
                  <span className="max-w-[90px] truncate">{sourceName}</span>
                </button>
                {showSources && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSources(false)} />
                    <div className="absolute right-0 top-full mt-2 z-20 min-w-[170px] bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 shadow-2xl">
                      {sources.map((src, i) => (
                        <button key={i} onClick={() => { switchSource(i); setShowSources(false) }}
                          className={cn('block w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', i === activeIdx ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                          <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', i === activeIdx ? 'bg-primary' : 'bg-transparent')} />
                          {src.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {type === 'tv' && (
            <div className="flex items-center gap-2 justify-center mb-2">
              <Link
                href={`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${Math.max(1, e - 1)}`}
                className={cn('flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-1.5 rounded-full transition-all text-white/80 hover:text-white', e <= 1 && 'opacity-30 pointer-events-none')}
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Préc.</span>
              </Link>
              <span className="text-xs font-semibold text-white/60 px-1">S{s}·E{e}</span>
              <Link
                href={`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${e + 1}`}
                className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-1.5 rounded-full transition-all text-white/80 hover:text-white"
              >
                <span>Suiv.</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {media?.overview && (
            <p className="text-xs text-white/50 leading-relaxed line-clamp-3 text-center mb-2">{media.overview}</p>
          )}

          {related.length > 0 && (
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-white/60">Suggestions</h3>
              <div className="flex items-center gap-1">
                <button onClick={shuffleRelated} className="text-white/40 hover:text-white/80 transition-colors p-1.5">
                  <Shuffle className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {related.map(m => (
              <div key={m.id} className="flex-shrink-0 w-24">
                <MediaCard item={m} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={playerRef} className="relative h-screen w-screen overflow-hidden bg-black select-none">
      {backdropUrl && (
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none">
          <img src={backdropUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}

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
              <div className="w-9 h-9 border-2 border-primary/30 border-t-transparent rounded-full animate-spin" />
            ) : (
              <p className="text-sm text-muted-foreground/60">{error || 'Aucun flux'}</p>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className={`absolute inset-x-0 top-0 z-30 transition-opacity duration-500 pointer-events-none ${showUi ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-gradient-to-b from-black/70 via-black/20 to-transparent pt-3 pb-14 px-3 md:pt-4 md:pb-20 md:px-5">
          <div className="flex items-center justify-between pointer-events-auto">
            <Link
              href={type === 'movie' ? `/movie/${id}` : `/tv/${id}`}
              className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white border border-white/10 transition-all hover:bg-black/70"
            >
              <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
            </Link>
            <div className="flex items-center gap-1.5 md:gap-2 pointer-events-auto">
              {sources.length > 1 && (
                <div className="relative">
                  <button onClick={() => setShowSources(!showSources)}
                    className="flex items-center gap-1 text-xs bg-black/50 hover:bg-black/70 border border-white/10 px-2 py-1.5 md:px-3 md:py-1.5 rounded-full transition-all text-white/80 hover:text-white backdrop-blur-sm">
                    <Monitor className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    <span className="hidden sm:inline text-xs">{sourceName}</span>
                  </button>
                  {showSources && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowSources(false)} />
                      <div className="absolute right-0 top-full mt-2 z-20 min-w-[170px] bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 shadow-2xl">
                        {sources.map((src, i) => (
                          <button key={i} onClick={() => { switchSource(i); setShowSources(false) }}
                            className={cn('block w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', i === activeIdx ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                            <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', i === activeIdx ? 'bg-primary' : 'bg-transparent')} />
                            {src.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {related.length > 0 && (
                <button onClick={() => setShowSuggestions(v => !v)}
                  className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white border border-white/10 transition-all backdrop-blur-sm">
                  <span className="text-xs md:text-sm font-semibold">+{related.length}</span>
                </button>
              )}
              {!hlsUrl && (
                <button onClick={toggleFullscreen}
                  className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white border border-white/10 transition-all backdrop-blur-sm">
                  <Maximize className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar - minimal */}
      <div className={`absolute inset-x-0 bottom-0 z-30 transition-opacity duration-500 pointer-events-none ${showUi && !showSuggestions ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-gradient-to-t from-black/80 via-black/30 to-transparent pt-20 pb-4 px-4 md:pt-32 md:pb-6 md:px-6">
          <div className="pointer-events-auto">
            {type === 'tv' && media && (
              <div className="flex items-center gap-2 md:gap-3">
                <Link
                  href={`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${Math.max(1, e - 1)}`}
                  className={cn('flex items-center gap-1 text-xs md:text-sm bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-1.5 md:px-4 md:py-2 rounded-full transition-all text-white/80 hover:text-white', e <= 1 && 'opacity-30 pointer-events-none')}
                >
                  <ChevronLeft className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  <span>Préc.</span>
                </Link>
                <span className="text-xs md:text-sm font-semibold text-white/60 px-1">S{s}·E{e}</span>
                <Link
                  href={`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${e + 1}`}
                  className="flex items-center gap-1 text-xs md:text-sm bg-white/10 hover:bg-white/20 border border-white/10 px-3 py-1.5 md:px-4 md:py-2 rounded-full transition-all text-white/80 hover:text-white"
                >
                  <span>Suiv.</span>
                  <ChevronRight className="w-3 h-3 md:w-3.5 md:h-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Suggestions panel */}
      {showSuggestions && (
        <div className="absolute inset-x-0 bottom-0 z-40 bg-black/90 backdrop-blur-md border-t border-white/10"
          style={{ maxHeight: '45vh' }}>
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <h3 className="text-xs md:text-sm font-semibold text-white/80">
              {type === 'tv' ? 'Continuer votre vision' : 'Suggestions'}
            </h3>
            <div className="flex items-center gap-1">
              <button onClick={shuffleRelated}
                className="text-white/40 hover:text-white/80 transition-colors p-1.5">
                <Shuffle className="w-3 h-3" />
              </button>
              <button onClick={() => setShowSuggestions(false)}
                className="text-white/40 hover:text-white/80 transition-colors p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto px-4 pb-4 scrollbar-thin">
            <div className="flex gap-2 md:gap-3">
              {related.map(m => (
                <div key={m.id} className="flex-shrink-0 w-28 md:w-36">
                  <MediaCard item={m} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
