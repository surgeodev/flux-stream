import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearch, useLocation, Link } from 'wouter'
import { ChevronLeft, ChevronRight, Star, Monitor, Maximize, Shuffle, Calendar, Clapperboard, Tv, X, Play, RotateCcw, ChevronDown, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMovie, getTVShow, getCatalog, getTrending, getFranchiseSuggestions, bgPath, getSeasonEpisodes, imgPath, type MediaItem } from '@/hooks/use-tmdb'
import { useStream } from '@/hooks/use-stream'
import { MediaCard } from '@/components/media-card'
import { VideoPlayer } from '@/components/video-player'
import { RoomPanel } from '@/components/room-panel'
import { useWatchProgress, getProgress } from '@/hooks/use-watch-progress'
import { readQueue, type QueueItem } from '@/hooks/use-playlist'
import { useRoom, type RoomMedia } from '@/hooks/use-room'
import { useProfile } from '@/hooks/use-profile'

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

function qualityBadge(name: string): { label: string; cls: string } | null {
  const lower = name.toLowerCase()
  if (/(cam|telesync|hdts)/.test(lower)) return { label: 'CAM', cls: 'bg-red-500/90' }
  const m = name.match(/(\d{3,4})p/)
  if (m) {
    const q = parseInt(m[1], 10)
    if (q < 480) return { label: 'SD', cls: 'bg-amber-500/80' }
    if (q < 720) return { label: '480p', cls: 'bg-amber-500/80' }
    if (q < 1080) return { label: '720p', cls: 'bg-emerald-500/80' }
    if (q === 1080) return { label: '1080p', cls: 'bg-emerald-500/80' }
    if (q >= 2160) return { label: '4K', cls: 'bg-purple-500/80' }
  }
  if (/4k|2160|uhd/.test(lower)) return { label: '4K', cls: 'bg-purple-500/80' }
  if (/hd|720/.test(lower)) return { label: 'HD', cls: 'bg-emerald-500/80' }
  return null
}

export default function Watch() {
  const searchString = useSearch()
  const params = new URLSearchParams(searchString)
  const type = (params.get('type') || 'movie') as 'movie' | 'tv'
  const id = params.get('id') || params.get('tmdb')
  const title = params.get('title') || ''
  const s = Number(params.get('s')) || 1
  const e = Number(params.get('e')) || 1
  const qMode = params.get('q') === '1'

  const { iframeUrl, hlsUrl, sourceName, sources, activeIdx, loading, error, fetchStream, switchSource } = useStream()
  const [, setLocation] = useLocation()
  const [media, setMedia] = useState<MediaItem | null>(null)
  const [related, setRelated] = useState<MediaItem[]>([])
  const [pageLoading, setPageLoading] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [simFs, setSimFs] = useState(false)
  const [failedSources, setFailedSources] = useState<Set<number>>(new Set())
  const [autoNext, setAutoNext] = useState<number | null>(null)
  const [nextEpTitle, setNextEpTitle] = useState('')
  const [playerInitialTime, setPlayerInitialTime] = useState(0)
  const [episodes, setEpisodes] = useState<{ episodeNumber: number; name: string; overview: string; still: string }[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(false)
  const [roomOpen, setRoomOpen] = useState(false)
  const { profile: roomProfile } = useProfile()
  const autoJoinCode = useMemo(() => new URLSearchParams(searchString).get('room'), [searchString])
  const roomApi = useRoom(autoJoinCode)
  const roomCommandRef = useRef<((cmd: { playing: boolean; time: number }) => void) | null>(null)
  roomApi.roomCommandRef.current = roomCommandRef.current
  const playerBoxRef = useRef<HTMLDivElement>(null)
  const isSmallLandscape = useMediaQuery('(orientation: landscape) and (max-height: 700px)')

  // --- Playlist playback queue (q=1) ---
  const queueRef = useRef<QueueItem[]>([])
  const [queueIdx, setQueueIdx] = useState(-1)

  useEffect(() => {
    if (qMode) {
      queueRef.current = readQueue()
      const cur = `${type}-${id}`
      setQueueIdx(queueRef.current.findIndex(q => `${q.type}-${q.id}` === cur))
    }
  }, [qMode, type, id])

  const isTouchDevice = useCallback(() => {
    if (typeof window === 'undefined') return false
    try {
      if (window.matchMedia('(any-pointer: coarse)').matches) return true
      if (window.matchMedia('(pointer: coarse)').matches) return true
    } catch {}
    return (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window
  }, [])

  const [isLandscapeTouch, setIsLandscapeTouch] = useState(
    () => isTouchDevice()
      && window.innerWidth > window.innerHeight
      && window.innerWidth <= 1200
  )

  useEffect(() => {
    setFailedSources(new Set())
  }, [hlsUrl, iframeUrl])

  const markSourceFailed = useCallback(() => {
    setFailedSources(prev => new Set(prev).add(activeIdx))
    if (activeIdx + 1 < sources.length) {
      setTimeout(() => switchSource(activeIdx + 1), 700)
    }
  }, [activeIdx, sources.length, switchSource])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Load episodes for the current season
  useEffect(() => {
    if (type !== 'tv' || !id) return
    setEpisodesLoading(true)
    getSeasonEpisodes(Number(id), s).then(list => {
      setEpisodes(list)
      setEpisodesLoading(false)
    }).catch(() => {
      setEpisodes([])
      setEpisodesLoading(false)
    })
  }, [type, id, s])

  // Real fullscreen takes over: clear simulated mode
  useEffect(() => {
    if (isFullscreen) setSimFs(false)
  }, [isFullscreen])

  // Robust phone-landscape detection (fires on rotate + resize + screen.orientation, not only matchMedia)
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const landscape = w > h && w <= 1200
      setIsLandscapeTouch(isTouchDevice() && landscape)
    }
    update()
    window.addEventListener('orientationchange', update)
    window.addEventListener('resize', update)
    screen.orientation?.addEventListener?.('change', update)
    return () => {
      window.removeEventListener('orientationchange', update)
      window.removeEventListener('resize', update)
      screen.orientation?.removeEventListener?.('change', update)
    }
  }, [isTouchDevice])

  useEffect(() => {
    const report = () => {
      const w = window.innerWidth, h = window.innerHeight
      const line = {
        ev: 'rotate-debug',
        dims: `${w}x${h}`,
        touch: isTouchDevice(),
        land: w > h && w <= 1200,
        fs: isFullscreen,
        simFs,
        fsApi: typeof document.fullscreenEnabled === 'boolean' ? document.fullscreenEnabled : null,
        ua: (navigator.userAgent || '').slice(0, 120),
      }
      try {
        fetch('/api/error-log', { method: 'POST', body: JSON.stringify(line) })
      } catch {}
    }
    report()
    window.addEventListener('orientationchange', report)
    window.addEventListener('resize', report)
    return () => {
      window.removeEventListener('orientationchange', report)
      window.removeEventListener('resize', report)
    }
  }, [isTouchDevice, isFullscreen, simFs])

  useEffect(() => {
    window.scrollTo(0, 0)
    setPageLoading(true)

    Promise.all([
      type === 'movie' ? getMovie(Number(id)).catch(() => undefined) : getTVShow(Number(id)).catch(() => undefined),
      type === 'movie' ? getFranchiseSuggestions(Number(id), 'movie', title) : getFranchiseSuggestions(Number(id), 'tv', title),
      getTrending(),
      getCatalog(),
    ]).then(([m, related, trending, cat]) => {
      setMedia(m ?? null)
      const seen = new Set([`${type}-${id}`])
      let mixed = related
      if (mixed.length < 10) {
        const filler = [...trending, ...cat]
          .filter(item => {
            const k = `${item.type}-${item.id}`
            if (seen.has(k)) return false
            seen.add(k)
            return true
          })
          .sort(() => Math.random() - 0.5)
        mixed = [...mixed, ...filler]
      }
      setRelated(mixed.slice(0, 10))
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

  // Auto fullscreen when phone rotates to landscape
  const autoFsBlockedRef = useRef(false)
  const wasLandscapeTouchRef = useRef(isLandscapeTouch)
  const isLandscapeTouchRef = useRef(isLandscapeTouch)

  useEffect(() => {
    isLandscapeTouchRef.current = isLandscapeTouch
    const prev = wasLandscapeTouchRef.current
    wasLandscapeTouchRef.current = isLandscapeTouch

    if (!isLandscapeTouch) {
      if (prev) {
        autoFsBlockedRef.current = false
        setSimFs(false)
        if (isFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        }
      }
      return
    }
    if (isFullscreen || simFs || autoFsBlockedRef.current) return
    const box = playerBoxRef.current
    if (!box) return
    if (typeof box.requestFullscreen !== 'function') {
      try { fetch('/api/error-log', { method: 'POST', body: JSON.stringify({ ev: 'fs-no-api' }) }) } catch {}
      setSimFs(true)
      return
    }
    try {
      const p = box.requestFullscreen() as Promise<void> | undefined
      if (!p) {
        setSimFs(true)
        return
      }
      p.catch((err: unknown) => {
        const name = err instanceof DOMException ? `${err.name}: ${err.message}` : String(err)
        try { fetch('/api/error-log', { method: 'POST', body: JSON.stringify({ ev: 'fs-deny', name }) }) } catch {}
      })
      setTimeout(() => {
        if (isLandscapeTouchRef.current && !document.fullscreenElement && !autoFsBlockedRef.current) {
          setSimFs(true)
        }
      }, 400)
    } catch (e) {
      try { fetch('/api/error-log', { method: 'POST', body: JSON.stringify({ ev: 'fs-sync-error', name: String(e) }) }) } catch {}
      setSimFs(true)
    }
  }, [isLandscapeTouch, isFullscreen, simFs])

  // If the user manually exits fullscreen while in landscape, don't re-enter automatically
  const wasFullscreenRef = useRef(false)
  useEffect(() => {
    if (wasFullscreenRef.current && !isFullscreen && isLandscapeTouch) {
      autoFsBlockedRef.current = true
    }
    wasFullscreenRef.current = isFullscreen
  }, [isFullscreen, isLandscapeTouch])
  const progressKey = type === 'tv' ? `tv-${id}-s${s}e${e}` : `movie-${id}`
  const { loadInitial } = useWatchProgress(progressKey)

  // Check for resumable progress when media loads — resume silently (no overlay)
  useEffect(() => {
    if (!media || !progressKey) return
    const progress = getProgress(progressKey)
    if (progress && progress.t > 5 && progress.t < progress.dur * 0.92) {
      setPlayerInitialTime(progress.t)
    }
  }, [media, progressKey])

  // --- Auto-next (TV episode, or next title in a playlist queue) ---
  const hasNext = type === 'tv'
  const nextUrl = hasNext
    ? `/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${e + 1}`
    : null

  const nextQueueUrl = useMemo(() => {
    if (!qMode || queueIdx < 0) return null
    const next = queueRef.current[queueIdx + 1]
    if (!next) return null
    return `/watch?q=1&type=${next.type}&id=${next.id}&title=${encodeURIComponent(next.title)}`
  }, [qMode, queueIdx])

  const resolvedNextUrl = qMode ? nextQueueUrl : nextUrl

  const handleEnded = useCallback(() => {
    if (qMode) {
      const next = queueIdx >= 0 ? queueRef.current[queueIdx + 1] : undefined
      if (next) {
        setNextEpTitle(next.title)
        setAutoNext(10)
      }
      return
    }
    if (type === 'tv') {
      setNextEpTitle(`S${s} · Épisode ${e + 1}`)
      setAutoNext(10)
    }
  }, [qMode, queueIdx, type, s, e])

  useEffect(() => {
    if (autoNext == null) return
    if (autoNext <= 0) {
      if (resolvedNextUrl) setLocation(resolvedNextUrl)
      return
    }
    const t = setTimeout(() => setAutoNext(c => (c == null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [autoNext, resolvedNextUrl])

  useEffect(() => {
    setAutoNext(null)
  }, [hlsUrl, iframeUrl])

  // Room: leader broadcasts current media so follower opens the same title
  const roomLastSentRef = useRef('')
  useEffect(() => {
    if (!roomApi.room || !roomApi.isLeader || !id) return
    const mediaKey = `${type}-${id}-${s}-${e}-${activeIdx}`
    if (roomLastSentRef.current === mediaKey) return
    roomLastSentRef.current = mediaKey
    const rm: RoomMedia = {
      url: window.location.href,
      mediaType: type,
      id: Number(id),
      s: type === 'tv' ? s : undefined,
      e: type === 'tv' ? e : undefined,
    }
    roomApi.sendMedia(rm)
  }, [roomApi.room, roomApi.isLeader, id, type, s, e, activeIdx, roomApi])

  // Room: follower receives media command -> navigate
  useEffect(() => {
    roomApi.setOnMedia((m: RoomMedia) => {
      const base = `/watch?type=${m.mediaType}&id=${m.id}&s=${m.s || 1}&e=${m.e || 1}&room=${roomApi.room?.code || ''}`
      setLocation(base)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setLocation, roomApi.room?.code])

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
        <VideoPlayer hlsUrl={hlsUrl} tmdbId={Number(id)} mediaType={type} title={media?.title} season={type === 'tv' ? s : undefined} episode={type === 'tv' ? e : undefined}
          poster={media?.img} progressKey={progressKey} initialTime={playerInitialTime} autoResume forceFullscreen={simFs}
          hlsSources={sources.filter(src => src.kind === 'hls').map(src => ({ index: sources.indexOf(src), name: src.name }))}
          activeSourceIdx={activeIdx}
          onSwitchSource={switchSource}
          onExitFullscreen={() => { autoFsBlockedRef.current = true; setSimFs(false) }}
          onStreamError={markSourceFailed} onEnded={handleEnded}
          roomCommandRef={roomCommandRef}
          onRoomState={(playing, time) => roomApi.report(playing, time)}
          roomOverlay={roomApi.room ? {
            members: roomApi.room.members,
            leaderUid: roomApi.room.leaderUid,
            selfUid: roomApi.selfUid,
            reactions: roomApi.reactions,
            react: roomApi.react,
          } : null} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          {backdropUrl && (
            <img src={backdropUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
          )}
          <div className="relative z-10 flex flex-col items-center gap-3">
            {loading || pageLoading ? (
              <div className="dot-spinner" role="status" aria-label="Chargement du flux">
                <div className="dot-spinner__dot" />
                <div className="dot-spinner__dot" />
                <div className="dot-spinner__dot" />
                <div className="dot-spinner__dot" />
                <div className="dot-spinner__dot" />
                <div className="dot-spinner__dot" />
                <div className="dot-spinner__dot" />
                <div className="dot-spinner__dot" />
              </div>
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
        {backdropUrl && !isFullscreen && !simFs && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {isReady && hlsUrl ? (
              <img src={backdropUrl} alt="" className="w-full h-full object-cover" style={{ animation: 'glowpulse 7s ease-in-out infinite', filter: 'blur(48px) saturate(1.3)', transform: 'scale(1.15)' }} />
            ) : (
              <img src={backdropUrl} alt="" className="w-full h-full object-cover opacity-[0.14]" />
            )}
            <div className={cn('absolute inset-0 bg-gradient-to-b', isReady && hlsUrl ? 'from-background/40 via-background/55 to-background' : 'from-background/60 via-background/80 to-background')} />
          </div>
        )}

        <div ref={playerBoxRef} className={cn(
          'w-full',
          simFs
            ? 'fixed inset-0 z-[60] flex items-center justify-center bg-black'
            : 'relative',
          isFullscreen && !simFs && 'min-h-dvh flex items-center justify-center bg-black'
        )}>
          <div className={cn(
            'relative w-full bg-black overflow-hidden shadow-2xl shadow-black/60 ring-1 ring-white/10',
            (isFullscreen || simFs)
              ? 'min-h-dvh'
              : 'aspect-video md:rounded-2xl md:mt-6 md:max-w-5xl md:mx-auto md:ring-white/5 max-md:max-h-[70dvh]',
            isSmallLandscape && !isFullscreen && !simFs && 'max-h-[52dvh] rounded-none mt-0 max-w-full'
          )}>
            {playerContent}

            {/* Auto-next overlay (Netflix style) */}
            {autoNext != null && resolvedNextUrl && (
              <div className="absolute bottom-14 md:bottom-24 right-3 md:right-6 z-30 animate-in fade-in slide-in-from-bottom-4 duration-200">
                <div className="w-72 md:w-80 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden">
                  {media?.backdrop && (
                    <div className="relative h-24 md:h-28 overflow-hidden">
                      <img src={bgPath(media.backdrop)} alt="" className="w-full h-full object-cover opacity-60" />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/30 to-transparent" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="w-12 h-12 rounded-full bg-black/50 backdrop-blur border border-white/20 flex items-center justify-center">
                          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">À venir</p>
                      <button onClick={() => setAutoNext(null)} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-sm md:text-base font-bold text-white mb-1">{qMode ? 'Titre suivant' : 'Épisode suivant'}</p>
                    <p className="text-xs text-white/50">{nextEpTitle}</p>
                  </div>
                  <div className="px-4 pb-4 flex items-center gap-2">
                    <button
                      onClick={() => { if (resolvedNextUrl) setLocation(resolvedNextUrl) }}
                      className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95"
                    >
                      <Play className="w-4 h-4 fill-current" /> Lire maintenant
                    </button>
                    <div className="relative w-11 h-11 flex-shrink-0">
                      <svg viewBox="0 0 44 44" className="w-11 h-11 -rotate-90">
                        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3.5" />
                        <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--primary))" strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeDasharray={`${(autoNext / 10) * (2 * Math.PI * 18)} ${2 * Math.PI * 18}`}
                          className="transition-all duration-1000 ease-linear" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">{autoNext}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Back button (exits simulated fullscreen for iframes; the HLS player has its own top bar) */}
            {simFs && isIframe ? (
              <button onClick={() => { autoFsBlockedRef.current = true; setSimFs(false) }}
                className="absolute top-3 left-3 z-20 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white border border-white/15 transition-all backdrop-blur-md">
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : !simFs && !isFullscreen ? (
              <Link
                href={type === 'movie' ? `/movie/${id}` : `/tv/${id}`}
                className="absolute top-14 left-3 z-20 w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white border border-white/15 transition-all backdrop-blur-md"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>
            ) : null}

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

      <main className={cn('mx-auto w-full px-5 md:px-6', (isFullscreen || simFs) ? 'hidden' : 'max-w-5xl pb-20')}>
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
            <button
              onClick={() => setRoomOpen(o => !o)}
              className={cn('flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full border transition-all',
                roomApi.room
                  ? 'bg-primary/15 text-primary border-primary/40 shadow-[0_0_15px_hsl(var(--primary)/0.25)]'
                  : 'bg-white/[0.04] text-white/50 border-white/10 hover:bg-white/[0.08] hover:text-white')}
            >
              <Users className="w-3.5 h-3.5" />
              Room
              {roomApi.room && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sources.some(src => src.kind === 'hls') && (() => {
              const hlsIdxs = sources.flatMap((s, i) => s.kind === 'hls' ? [i] : [])
              const allHlsFailed = hlsIdxs.every(i => failedSources.has(i))
              const activeHls = sources[activeIdx]?.kind === 'hls'
              const activeName = activeHls ? sources[activeIdx].name : sources[hlsIdxs[0]]?.name
              const badge = activeName ? qualityBadge(activeName) : null
              return (
                <button key="flux"
                  onClick={() => {
                    const next = hlsIdxs.find(i => !failedSources.has(i)) ?? hlsIdxs[0]
                    if (next != null) switchSource(next)
                  }}
                  className={cn(
                    'group flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 border',
                    activeHls && !allHlsFailed
                      ? 'bg-primary/90 text-white border-primary shadow-lg shadow-primary/20 scale-[1.03]'
                      : 'bg-white/[0.04] text-white/55 border-white/10 hover:bg-white/[0.09] hover:text-white hover:border-white/20',
                    allHlsFailed && 'opacity-70'
                  )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full transition-colors', activeHls && !allHlsFailed ? 'bg-white' : 'bg-white/20 group-hover:bg-white/50')} />
                  Flux
                  {badge && (
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide', badge.cls, activeHls && !allHlsFailed ? 'text-white' : 'text-white/90')}>
                      {badge.label}
                    </span>
                  )}
                  {allHlsFailed && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                      Indisponible
                    </span>
                  )}
                </button>
              )
            })()}
            {sources.filter(src => src.kind === 'iframe').map((src, i) => {
              const idx = sources.indexOf(src)
              const failed = failedSources.has(idx)
              return (
                <button key={`iframe-${i}`}
                  onClick={() => switchSource(idx)}
                  className={cn(
                    'group flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 border',
                    idx === activeIdx
                      ? 'bg-primary/90 text-white border-primary shadow-lg shadow-primary/20 scale-[1.03]'
                      : 'bg-white/[0.04] text-white/55 border-white/10 hover:bg-white/[0.09] hover:text-white hover:border-white/20',
                    failed && idx !== activeIdx && 'opacity-50'
                  )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full transition-colors', idx === activeIdx ? 'bg-white' : 'bg-white/20 group-hover:bg-white/50')} />
                  {src.name}
                  {failed && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                      Indisponible
                    </span>
                  )}
                </button>
              )
            })}
            {sources.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground/60">{error || 'Aucune source disponible'}</p>
            )}
          </div>

          {roomOpen && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden max-w-md">
              <RoomPanel roomApi={roomApi} profile={roomProfile} />
            </div>
          )}
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
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">Épisodes</h2>
              <span className="h-px flex-1 bg-white/5" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Season selector */}
              <div className="relative flex-shrink-0">
                <select value={s} onChange={e => { const ns = Number(e.target.value); setLocation(`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${ns}&e=1`) }}
                  className="appearance-none bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary text-white">
                  {Array.from({ length: media?.seasons || 1 }, (_, i) => i + 1).map(seasonNum => (
                    <option key={seasonNum} value={seasonNum}>Saison {seasonNum}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
              </div>
              {/* Episode list scrollable */}
              <div className="flex-1 min-w-0 flex gap-2.5 md:gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {episodesLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-28 md:w-36 aspect-[2/3] rounded-xl bg-white/[0.04] border border-white/10 animate-pulse" />
                  ))
                ) : episodes.length > 0 ? (
                  episodes.map(ep => (
                    <Link
                      key={ep.episodeNumber}
                      href={`/watch?type=tv&id=${id}&title=${encodeURIComponent(title)}&s=${s}&e=${ep.episodeNumber}`}
                      className={cn(
                        'group flex-shrink-0 flex flex-col gap-1.5 w-28 md:w-36 p-2 rounded-xl transition-all border',
                        ep.episodeNumber === e
                          ? 'border-primary bg-primary/10 ring-1 ring-primary'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                      )}
                    >
                      <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-black/40">
                        {ep.still ? (
                          <img src={imgPath(ep.still, 'w780')} alt={ep.name} loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/15 to-transparent">
                            <span className="text-xs font-black text-white/25">S{s}·E{String(ep.episodeNumber).padStart(2, '0')}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                        <span className={cn('absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white/90',
                          ep.episodeNumber === e ? 'bg-primary text-white' : '')}>
                          E{String(ep.episodeNumber).padStart(2, '0')}
                        </span>
                        {ep.episodeNumber === e && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="w-9 h-9 rounded-full bg-black/60 backdrop-blur border border-white/25 flex items-center justify-center">
                              <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold text-white line-clamp-1 text-center leading-tight">
                        {ep.name || `Épisode ${ep.episodeNumber}`}
                      </span>
                      {ep.overview && (
                        <span className="text-[9px] text-white/40 line-clamp-1 text-center leading-snug">{ep.overview}</span>
                      )}
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground/60 py-3">Aucun épisode trouvé pour cette saison.</p>
                )}
              </div>
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
                <div key={`${m.type}-${m.id}`} className="flex-shrink-0 w-32 md:w-44 snap-start">
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
