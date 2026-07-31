import { useRef, useEffect, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, Captions } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VideoPlayerProps {
  hlsUrl: string
  tmdbId?: number
  mediaType?: string
  title?: string
}

type Quality = { level: number; height: number; width: number; name: string }
type SubTrack = { index: number; name: string; lang?: string; kind: 'hls' } | { index: number; name: string; lang?: string; kind: 'opensubs'; fileId: number }

export function VideoPlayer({ hlsUrl, tmdbId, mediaType, title }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [qualities, setQualities] = useState<Quality[]>([])
  const [currentQuality, setCurrentQuality] = useState(-1)
  const [showSettings, setShowSettings] = useState(false)
  const [subs, setSubs] = useState<SubTrack[]>([])
  const [activeSub, setActiveSub] = useState(-1)
  const [showSubs, setShowSubs] = useState(false)
  const [osSubs, setOsSubs] = useState<{ lang: string; url: string; name: string }[]>([])
  const [seekHoverTime, setSeekHoverTime] = useState<number | null>(null)

  const showTemporarily = useCallback(() => {
    setShowControls(true)
    setShowSettings(false)
    setShowSubs(false)
    clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => {
      if (playing) setShowControls(false)
    }, 4000)
  }, [playing])

  useEffect(() => {
    return () => clearTimeout(controlsTimer.current)
  }, [])

  const loadOSSubs = useCallback(async () => {
    if (!tmdbId || !mediaType) return
    try {
      const res = await fetch(`/api/subtitles?tmdb_id=${tmdbId}&type=${mediaType}`)
      const data = await res.json()
      if (data.subtitles?.length) {
        setOsSubs(data.subtitles)
        const os: SubTrack[] = data.subtitles.map((s: any, i: number) => ({
          index: i + 100, kind: 'opensubs' as const,
          name: s.name, lang: s.lang, fileId: s.file_id,
        }))
        setSubs(prev => {
          const hlsOnly = prev.filter(s => s.kind === 'hls')
          return [...hlsOnly, ...os]
        })
      }
    } catch {}
  }, [tmdbId, mediaType])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !hlsUrl) return

    setReady(false)
    hlsRef.current?.destroy()
    hlsRef.current = null
    setQualities([])
    setCurrentQuality(-1)
    setSubs([])
    setActiveSub(-1)
    setOsSubs([])

    let cancelled = false

    const playStream = (streamUrl: string) => {
      if (cancelled) return
      const isM3u8 = streamUrl.includes('.m3u8') || streamUrl.includes('/playlist/') || streamUrl.includes('/m3u8-proxy')
      if (isM3u8 && Hls.isSupported()) {
        const hls = new Hls({ enableWebVTT: true, renderTextTracksNatively: true })
        hlsRef.current = hls
        hls.loadSource(streamUrl)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setReady(true)
          const levels = hls.levels || []
          if (levels.length > 0) {
            const qs = levels.map((l: any, i: number) => ({
              level: i, height: l.height || 0, width: l.width || 0,
              name: l.height >= 1080 ? '1080p' : l.height >= 720 ? '720p' : l.height >= 480 ? '480p' : l.height ? `${l.height}p` : 'Auto',
            }))
            setQualities([{ level: -1, height: 0, width: 0, name: 'Auto' }, ...qs])
            setCurrentQuality(hls.autoLevelEnabled ? -1 : hls.currentLevel)
          }
          video.play().catch(() => {})
        })

        hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          setCurrentQuality(data.level)
        })

        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
          const tracks = hls.subtitleTracks || []
          const hlsSubs: SubTrack[] = tracks.map((t, i) => ({
            index: i, kind: 'hls' as const,
            name: t.name || t.lang || `Piste ${i + 1}`,
            lang: t.lang,
          }))
          setSubs(prev => {
            const osOnly = prev.filter(s => s.kind === 'opensubs')
            return [...hlsSubs, ...osOnly]
          })
        })

        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) hls.destroy()
        })
      } else if (isM3u8 && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl
        setReady(true)
      } else {
        video.src = streamUrl
        setReady(true)
      }
    }

    const isCloudflareApi = hlsUrl.startsWith('https://flux-stream-api.surgeodev.workers.dev')
    const isLocalApi = hlsUrl.includes('/api/streams/')
    if (isCloudflareApi || isLocalApi) {
      fetch(hlsUrl)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((data: any) => {
          const stream = data?.sources?.[0]?.stream ?? data?.streams?.[0]?.url
          if (stream) playStream(stream)
        })
        .catch(() => {})
    } else {
      playStream(hlsUrl)
    }

    loadOSSubs()

    return () => {
      cancelled = true
      hlsRef.current?.destroy()
      hlsRef.current = null
      video.src = ''
    }
  }, [hlsUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTimeUpdate = () => setCurrentTime(video.currentTime)
    const onDurationChange = () => setDuration(video.duration || 0)
    const onProgress = () => {
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1))
    }
    const onPlay = () => { setPlaying(true); setEnded(false) }
    const onPause = () => setPlaying(false)
    const onEnded = () => setEnded(true)

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('progress', onProgress)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('progress', onProgress)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
    }
  }, [])

  useEffect(() => {
    const onMouseMove = () => showTemporarily()
    document.addEventListener('mousemove', onMouseMove)
    showTemporarily()
    return () => document.removeEventListener('mousemove', onMouseMove)
  }, [showTemporarily])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (!video) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          video.playbackRate = 2
          if (video.paused) video.play()
          break
        case 'KeyF':
          e.preventDefault()
          if (!document.fullscreenElement) video.requestFullscreen().catch(() => {})
          else document.exitFullscreen().catch(() => {})
          break
        case 'ArrowLeft':
          e.preventDefault()
          video.currentTime = Math.max(0, video.currentTime - 10)
          break
        case 'ArrowRight':
          e.preventDefault()
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
          break
        case 'ArrowUp':
          e.preventDefault()
          video.volume = Math.min(1, video.volume + 0.1)
          setVolume(video.volume); setMuted(false)
          break
        case 'ArrowDown':
          e.preventDefault()
          video.volume = Math.max(0, video.volume - 0.1)
          setVolume(video.volume); setMuted(video.volume === 0)
          break
        case 'KeyM':
          e.preventDefault()
          video.muted = !video.muted; setMuted(video.muted)
          break
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const video = videoRef.current
        if (video) video.playbackRate = 1
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    playing ? video.pause() : video.play()
    showTemporarily()
  }, [playing, showTemporarily])

  const handleSeek = useCallback((e: React.MouseEvent) => {
    const rect = progressRef.current?.getBoundingClientRect()
    if (!rect || !videoRef.current) return
    const x = (e.clientX - rect.left) / rect.width
    videoRef.current.currentTime = x * (videoRef.current.duration || 0)
  }, [])

  const handleProgressHover = useCallback((e: React.MouseEvent) => {
    const rect = progressRef.current?.getBoundingClientRect()
    if (!rect || !videoRef.current) return
    const x = (e.clientX - rect.left) / rect.width
    setSeekHoverTime(x * (videoRef.current.duration || 0))
  }, [])

  const handleProgressLeave = useCallback(() => {
    setSeekHoverTime(null)
  }, [])

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    const video = videoRef.current
    if (!video) return
    const rect = video.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width / 2) {
      video.currentTime = Math.max(0, video.currentTime - 10)
    } else {
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
    }
  }, [])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    setVolume(v)
    if (videoRef.current) {
      videoRef.current.volume = v
      videoRef.current.muted = v === 0
      setMuted(v === 0)
    }
  }, [])

  const switchQuality = useCallback((level: number) => {
    const hls = hlsRef.current
    if (!hls) return
    hls.currentLevel = level === -1 ? -1 : level
    setCurrentQuality(level)
    setShowSettings(false)
  }, [])

  const switchSub = useCallback(async (sub: SubTrack) => {
    const hls = hlsRef.current
    if (!hls && sub.kind !== 'opensubs') return

    if (sub.kind === 'hls') {
      setActiveSub(sub.index)
      hls!.subtitleTrack = sub.index
      hls!.subtitleDisplay = true
    } else if (sub.kind === 'opensubs') {
      setActiveSub(sub.index)
      if (hls) hls.subtitleTrack = -1
      try {
        const res = await fetch(`/api/subtitle-download?file_id=${sub.fileId}`)
        if (!res.ok) return
        const text = await res.text()
        const video = videoRef.current
        if (!video) return
        const existing = video.querySelector('track[data-os]')
        if (existing) existing.remove()
        const track = document.createElement('track')
        track.kind = 'subtitles'
        track.label = sub.name
        track.srclang = sub.lang || 'en'
        track.setAttribute('data-os', '')
        const blob = new Blob([text], { type: 'text/vtt' })
        track.src = URL.createObjectURL(blob)
        video.appendChild(track)
        track.track.mode = 'showing'
      } catch {}
    }
    setShowSubs(false)
  }, [])

  const disableSubs = useCallback(() => {
    const hls = hlsRef.current
    if (hls) {
      hls.subtitleTrack = -1
      hls.subtitleDisplay = false
    }
    const existing = document.querySelector('track[data-os]')
    if (existing) existing.remove()
    setActiveSub(-1)
    setShowSubs(false)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (!document.fullscreenElement) video.requestFullscreen().catch(() => {})
    else document.exitFullscreen().catch(() => {})
  }, [])

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0
  const hasSubs = subs.length > 0
  const subActive = activeSub >= 0
  const currentSubName = subActive ? subs.find(s => s.index === activeSub)?.name : ''

  return (
    <div className="absolute inset-0 bg-black group" onMouseMove={showTemporarily}>
      <video ref={videoRef} className="absolute inset-0 w-full h-full bg-black" playsInline
        onClick={togglePlay} onDoubleClick={handleDblClick} />

      {!playing && !ended && (
        <div className={cn('absolute inset-0 flex items-center justify-center transition-opacity duration-300', showControls ? 'opacity-100' : 'opacity-0')}>
          <button onClick={togglePlay}
            className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all pointer-events-auto">
            <Play className="w-7 h-7 md:w-9 md:h-9 text-white fill-white ml-0.5 md:ml-1" />
          </button>
        </div>
      )}

      {ended && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <button onClick={togglePlay}
            className="flex flex-col items-center gap-2 text-white/80 hover:text-white transition-colors">
            <Play className="w-12 h-12 md:w-16 md:h-16 fill-white/80" />
            <span className="text-sm">Revoir</span>
          </button>
        </div>
      )}

      <div className={cn('absolute inset-x-0 bottom-0 transition-opacity duration-500', showControls ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
        <div className="bg-gradient-to-t from-black/90 via-black/40 to-transparent pt-16 pb-2 px-3 md:px-4">
          <div ref={progressRef} onClick={handleSeek} onMouseMove={handleProgressHover} onMouseLeave={handleProgressLeave}
            className="relative w-full h-1 md:h-1.5 group/progress cursor-pointer mb-2 md:mb-3"
          >
            <div className="absolute inset-0 bg-white/20 rounded-full" />
            <div className="absolute inset-y-0 left-0 bg-white/30 rounded-full" style={{ width: `${bufferedPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-primary rounded-full" style={{ width: `${progress}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 bg-primary rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-lg"
              style={{ left: `${progress}%`, marginLeft: '-6px' }} />
            {seekHoverTime != null && (
              <div className="absolute -top-7 -translate-x-1/2 bg-black/80 text-white text-[10px] md:text-xs px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap"
                style={{ left: `${(seekHoverTime / (duration || 1)) * 100}%` }}>
                {formatTime(seekHoverTime)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={togglePlay}
              className="text-white/80 hover:text-white transition-colors p-1">
              {playing ? <Pause className="w-4 h-4 md:w-5 md:h-5" /> : <Play className="w-4 h-4 md:w-5 md:h-5 fill-white/80" />}
            </button>

            <span className="text-[11px] md:text-xs text-white/60 font-mono min-w-[80px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div className="flex items-center gap-1.5 md:gap-2 ml-1">
              <button onClick={() => { if (videoRef.current) { videoRef.current.muted = !muted; setMuted(!muted) } }}
                className="text-white/70 hover:text-white transition-colors p-1">
                {muted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Volume2 className="w-3.5 h-3.5 md:w-4 md:h-4" />}
              </button>
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 md:w-20 h-1 accent-primary appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full" />
            </div>

            <div className="flex-1 min-w-0 px-1 md:px-2">
              {title && (
                <span className="block text-[10px] md:text-xs text-white/50 truncate text-center leading-tight">
                  {title}
                </span>
              )}
            </div>

            {hasSubs && (
              <div className="relative">
                <button onClick={() => { setShowSubs(v => !v); setShowSettings(false) }}
                  className={cn('text-white/70 hover:text-white transition-colors p-1 relative', subActive && 'text-primary')}>
                  <Captions className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  {subActive && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />}
                </button>
                {showSubs && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSubs(false)} />
                    <div className="absolute bottom-full right-0 mb-2 z-20 min-w-[160px] bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 shadow-2xl max-h-60 overflow-y-auto">
                      <button onClick={disableSubs}
                        className={cn('block w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors', !subActive ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                        <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', !subActive ? 'bg-primary' : 'bg-transparent')} />
                        Aucun
                      </button>
                      {subs.map(sub => (
                        <button key={`${sub.kind}-${sub.index}`} onClick={() => switchSub(sub)}
                          className={cn('block w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors', activeSub === sub.index ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                          <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', activeSub === sub.index ? 'bg-primary' : 'bg-transparent')} />
                          {sub.name}
                          {sub.kind === 'opensubs' && <span className="ml-1.5 text-[10px] text-white/30">OS</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {qualities.length > 1 && (
              <div className="relative">
                <button onClick={() => { setShowSettings(v => !v); setShowSubs(false) }}
                  className="text-white/70 hover:text-white transition-colors p-1">
                  <Settings className="w-3.5 h-3.5 md:w-4 md:h-4" />
                </button>
                {showSettings && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSettings(false)} />
                    <div className="absolute bottom-full right-0 mb-2 z-20 min-w-[130px] bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 shadow-2xl">
                      <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold">Qualité</p>
                      {qualities.map(q => (
                        <button key={q.level} onClick={() => switchQuality(q.level)}
                          className={cn('block w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors', currentQuality === q.level ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                          {q.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <button onClick={toggleFullscreen}
              className="text-white/70 hover:text-white transition-colors p-1">
              {document.fullscreenElement
                ? <Minimize className="w-3.5 h-3.5 md:w-4 md:h-4" />
                : <Maximize className="w-3.5 h-3.5 md:w-4 md:h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
