import { useRef, useEffect, useState, useCallback, type CSSProperties } from 'react'
import Hls from 'hls.js'
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Settings, Captions, RotateCcw, RotateCw, Check, ChevronLeft, Sun, Download, X, Loader2, ZoomIn, PictureInPicture2, SkipForward, Film, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { withBase } from '@/lib/base-path'
import { rewriteLocalUrl } from '@/hooks/use-tmdb'
import { saveProgress, clearProgress } from '@/hooks/use-watch-progress'
import { RoomOverlay } from '@/components/room-overlay'
import { useToast } from '@/components/ui/use-toast'
import type { RoomMember, RoomReaction } from '@/hooks/use-room'

interface VideoPlayerProps {
  hlsUrl: string
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title?: string
  season?: number
  episode?: number
  poster?: string
  progressKey?: string
  initialTime?: number
  autoResume?: boolean
  playSignal?: number
  forceFullscreen?: boolean
  onExitFullscreen?: () => void
  onStreamError?: () => void
  onEnded?: () => void
  hlsSources?: { index: number; name: string }[]
  activeSourceIdx?: number
  onSwitchSource?: (idx: number) => void
  onRoomState?: (playing: boolean, time: number) => void
  roomCommandRef?: { current: ((cmd: { playing: boolean; time: number }) => void) | null }
  roomOverlay?: {
    members: RoomMember[]
    leaderUid: string | null
    selfUid: string | null
    reactions: RoomReaction[]
    react: (emoji: string) => void
  } | null
}

export type RoomCommand = { playing: boolean; time: number }

type Quality = { level: number; height: number; width: number; name: string }
type SubTrack = { index: number; name: string; lang?: string; kind: 'hls' } | { index: number; name: string; lang?: string; kind: 'opensubs'; fileId: string; local?: boolean }

function parseVtt(text: string): { start: number; end: number; text: string }[] {
  const cues: { start: number; end: number; text: string }[] = []
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim())
    if (!lines.length) continue
    const timeIdx = lines.findIndex(l => l.includes('-->'))
    if (timeIdx < 0) continue
    const m = lines[timeIdx].match(/(\d+):(\d+):(\d+(?:[.,]\d+)?)\s*-->\s*(\d+):(\d+):(\d+(?:[.,]\d+)?)/)
    if (!m) continue
    const toSec = (h: string, min: string, s: string) => +h * 3600 + +min * 60 + parseFloat(s.replace(',', '.'))
    const text = lines.slice(timeIdx + 1).join('\n')
    if (!text.trim()) continue
    cues.push({ start: toSec(m[1], m[2], m[3]), end: toSec(m[4], m[5], m[6]), text })
  }
  return cues
}

function sanitizeSub(text: string): string {
  const cleaned = text.replace(/\{[^}]*\}/g, '')
  const escaped = cleaned.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped
    .replace(/&lt;(\/?)(i|b|u|br)(&gt;)/gi, '<$1$2>')
    .replace(/&lt;font[^&]*&gt;/gi, '<font>')
    .replace(/&lt;\/font&gt;/gi, '</font>')
    .replace(/&lt;[^&]*&gt;/g, '')
}
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const SUB_SYNC_KEY = 'flux-sub-sync'
const SPEED_KEY = 'flux-speed'
const SUB_PREF_KEY = 'flux-sub-lang'
const QUALITY_KEY = 'flux-quality'
const TAP_DELAY = 300
const DBL_TAP_WINDOW = 320

function readSpeed(): number {
  if (typeof window === 'undefined') return 1
  try {
    const v = parseFloat(window.localStorage.getItem(SPEED_KEY) || '')
    return SPEEDS.includes(v) ? v : 1
  } catch {
    return 1
  }
}
function readSubPref(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(SUB_PREF_KEY) || ''
  } catch {
    return ''
  }
}
function readQualityPref(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(QUALITY_KEY) || ''
  } catch {
    return ''
  }
}

export function VideoPlayer({ hlsUrl, tmdbId, mediaType, title, season, episode, poster, progressKey, initialTime, autoResume, playSignal, forceFullscreen, onExitFullscreen, onStreamError, onEnded, hlsSources, activeSourceIdx, onSwitchSource, onRoomState, roomCommandRef, roomOverlay }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const { toast } = useToast()
  const roomLastReportRef = useRef(0)
  const onRoomStateRef = useRef(onRoomState)
  onRoomStateRef.current = onRoomState
  // Suiveur: commandes reçues de la room (play/pause/seek)
  useEffect(() => {
    if (roomCommandRef) roomCommandRef.current = (cmd: { playing: boolean; time: number }) => {
      const video = videoRef.current
      if (!video) return
      const drift = Math.abs(video.currentTime - cmd.time)
      if (cmd.time >= 0 && drift > 1.5) {
        video.currentTime = cmd.time
      }
      if (cmd.playing) { video.play().catch(() => {}) }
      else if (!video.paused) { video.pause() }
    }
    return () => { if (roomCommandRef) roomCommandRef.current = null }
  }, [roomCommandRef])
  const progressRef = useRef<HTMLDivElement>(null)
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
   const introTransitionRef = useRef(false)
   const showControlsRef = useRef(true)
   const maxPosRef = useRef(0)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const playingRef = useRef(false)
  const [ended, setEnded] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(() => {
    if (typeof window === 'undefined') return 1
    const v = parseFloat(window.localStorage.getItem('flux-volume') || '')
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1
  })
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('flux-muted') === '1'
  })
   const volumeRef = useRef(volume)
   const mutedRef = useRef(muted)
   const introRef = useRef<HTMLVideoElement | null>(null)
   const introDoneRef = useRef(false)
   const introSeenRef = useRef(false)
   const fadePendingRef = useRef(false)
   const [introActive, setIntroActive] = useState(false)
   const [introPaused, setIntroPaused] = useState(false)
   const introActiveRef = useRef(false)
   const introPausedRef = useRef(false)
   const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPip, setIsPip] = useState(false)
  const [pipSupported, setPipSupported] = useState(true)
  const [qualities, setQualities] = useState<Quality[]>([])
  const [currentQuality, setCurrentQuality] = useState(-1)
  const [showSettings, setShowSettings] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(readSpeed)
  const [subs, setSubs] = useState<SubTrack[]>([])
  const [activeSub, setActiveSub] = useState(-1)
  const qualityPrefRef = useRef(readQualityPref())
  const [showSubs, setShowSubs] = useState(false)
  const [audioTracks, setAudioTracks] = useState<{ id: number; lang: string; name: string }[]>([])
  const [currentAudio, setCurrentAudio] = useState(-1)
  const [showDownload, setShowDownload] = useState(false)
  const [downloadAudio, setDownloadAudio] = useState('')
  const [downloadSub, setDownloadSub] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [nearEnd, setNearEnd] = useState(false)
  const userPickedAudio = useRef(false)
  const [osCues, setOsCues] = useState<{ start: number; end: number; text: string }[]>([])
  const [osOffset, setOsOffset] = useState(0)
  const [activeCue, setActiveCue] = useState<string | null>(null)
  const osCuesRef = useRef<{ start: number; end: number; text: string }[]>([])
  const osOffsetRef = useRef(0)
  const osScaleRef = useRef(1)
  const [subSize, setSubSize] = useState(() => {
    if (typeof window === 'undefined') return 1
    const v = parseFloat(window.localStorage.getItem('flux-sub-size') || '')
    return Number.isFinite(v) && v >= 0.6 && v <= 2.2 ? v : 1
  })
  const [subBgOpacity, setSubBgOpacity] = useState(() => {
    if (typeof window === 'undefined') return 0.55
    const v = parseFloat(window.localStorage.getItem('flux-sub-bg') || '')
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.55
  })
  const [subTextColor, setSubTextColor] = useState(() => {
    if (typeof window === 'undefined') return '#ffffff'
    const c = window.localStorage.getItem('flux-sub-color')
    return c || '#ffffff'
  })
  const osFirstStartRef = useRef(0)
  const hlsSubTrackRef = useRef(-1)
  const hlsCuesLoadedRef = useRef(0)
  const [osSubs, setOsSubs] = useState<{ lang: string; url: string; name: string; file_id?: string }[]>([])
  const [seekHoverTime, setSeekHoverTime] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [flashIcon, setFlashIcon] = useState<'play' | 'pause' | null>(null)
  const [resumeAsk, setResumeAsk] = useState(false)
  const resumeAskedRef = useRef(false)
  const [dblFlash, setDblFlash] = useState<{ side: 'left' | 'right'; ts: number } | null>(null)
  const dblTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const longPressActive = useRef(false)
  const justLongPressed = useRef(0)
  const suppressMoveUntil = useRef(0)
  const baseRateRef = useRef(1)
  const menuOpenRef = useRef(false)
  const spaceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const spaceHeld = useRef(false)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastTapTs = useRef(0)
  const lastTouchTs = useRef(0)
  const fullscreenRef = useRef(false)
  const forceFsRef = useRef(!!forceFullscreen)
  const CINEMA_KEY = 'flux-cinema-mode'
  const [cinemaMode, setCinemaMode] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return window.localStorage.getItem(CINEMA_KEY) === '1' } catch { return false }
  })
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const cinemaNodesRef = useRef<{ low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode; comp: DynamicsCompressorNode; gain: GainNode } | null>(null)

  // persist cinéma
  useEffect(() => {
    try { window.localStorage.setItem(CINEMA_KEY, cinemaMode ? '1' : '0') } catch {}
  }, [cinemaMode])

  // Web Audio : mode ciné (basses profondes + dialogues clairs + comp)
  const enableCinemaAudio = useCallback(() => {
    const video = videoRef.current
    if (!video) return false
    try {
      let ctx: AudioContext | null = audioCtxRef.current as AudioContext | null
      if (!ctx) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext
        if (!AC) return false
        ctx = new AC() as AudioContext
        audioCtxRef.current = ctx as any
      }
      if (!ctx) return false
      const ac: AudioContext = ctx
      if (ac.state === 'suspended') ac.resume().catch(() => {})
      let src = sourceRef.current
      if (!src) {
        src = ac.createMediaElementSource(video)
        sourceRef.current = src
      }
      // si déjà branché cinéma, ne refais rien
      if (cinemaNodesRef.current) return true
      try { src.disconnect() } catch {}
      const low = ac.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 140; low.gain.value = 5.5
      const mid = ac.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1100; mid.Q.value = 0.9; mid.gain.value = 1.8
      const high = ac.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 8200; high.gain.value = -1.2
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -22; comp.knee.value = 28; comp.ratio.value = 3.2; comp.attack.value = 0.025; comp.release.value = 0.22
      const gain = ac.createGain(); gain.gain.value = 1.08
      src.connect(low); low.connect(mid); mid.connect(high); high.connect(comp); comp.connect(gain); gain.connect(ac.destination)
      cinemaNodesRef.current = { low, mid, high, comp, gain }
      ;(video as any).__fluxCinema = true
      return true
    } catch (e) {
      // CORS ou autre -> fallback silencieux (filtre vidéo seul)
      console.warn('cinema audio failed', e)
      return false
    }
  }, [])

  const disableCinemaAudio = useCallback(() => {
    const video = videoRef.current
    const ctx = audioCtxRef.current
    const src = sourceRef.current
    const nodes = cinemaNodesRef.current
    if (!src) return
    try { src.disconnect() } catch {}
    if (nodes) {
      try { nodes.low.disconnect(); nodes.mid.disconnect(); nodes.high.disconnect(); nodes.comp.disconnect(); nodes.gain.disconnect() } catch {}
      cinemaNodesRef.current = null
    }
    // reconnect direct -> destination (passthrough neutre, contexte doit rester running)
    if (ctx && src) {
      try { src.connect(ctx.destination) } catch {}
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    }
    if (video) (video as any).__fluxCinema = false
  }, [])

  useEffect(() => {
    if (cinemaMode) {
      const ok = enableCinemaAudio()
      if (!ok) {
        // si échec audio, on garde quand même le filtre vidéo
        toast({ title: 'Mode Cinéma', description: 'Filtre image activé — son cinéma indisponible sur cette source (CORS).', variant: 'default' })
      } else {
        // petit toast une seule fois
        // toast({ title: 'Mode Cinéma ON', description: 'Image contrastée · Basses profondes', variant: 'success' })
      }
    } else {
      disableCinemaAudio()
    }
  }, [cinemaMode, enableCinemaAudio, disableCinemaAudio])

  // si la source HLS change, le MediaElementSource reste valide, mais on doit re-resume
  useEffect(() => {
    if (cinemaMode && audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {})
  }, [hlsUrl, cinemaMode])

  // cleanup
  useEffect(() => {
    return () => {
      try { sourceRef.current?.disconnect() } catch {}
      const n = cinemaNodesRef.current
      if (n) try { n.low.disconnect(); n.mid.disconnect(); n.high.disconnect(); n.comp.disconnect(); n.gain.disconnect() } catch {}
      try { audioCtxRef.current?.close() } catch {}
    }
  }, [])

  const toggleCinema = useCallback(() => {
    // nécessite un geste utilisateur pour AudioContext
    setCinemaMode(v => {
      const next = !v
      if (next) {
        setTimeout(() => enableCinemaAudio(), 30)
        toast({ title: 'Mode Cinéma activé', description: 'Couleurs chaudes + son immersif', variant: 'default' })
      } else {
        toast({ title: 'Mode Cinéma désactivé', description: 'Image et son d’origine', variant: 'default' })
      }
      return next
    })
  }, [enableCinemaAudio])

  const showTemporarily = useCallback(() => {
     if (introTransitionRef.current) return
     if (introActiveRef.current) return
     setShowControls(true)
     clearTimeout(controlsTimer.current)
     controlsTimer.current = setTimeout(() => {
       if (playing && !menuOpenRef.current) setShowControls(false)
     }, 4000)
   }, [playing])

  const toggleOverlay = useCallback(() => {
    clearTimeout(controlsTimer.current)
    if (showControls) {
      setShowControls(false)
    } else {
      setShowControls(true)
      controlsTimer.current = setTimeout(() => {
        if ((playingRef.current || (introActiveRef.current && !introPausedRef.current)) && !menuOpenRef.current) setShowControls(false)
      }, 4000)
    }
  }, [showControls, playing])

  useEffect(() => {
    showControlsRef.current = showControls
  }, [showControls])

  useEffect(() => {
    introActiveRef.current = introActive
    if (!introActive) setIntroPaused(false)
  }, [introActive])

  useEffect(() => {
    introPausedRef.current = introPaused
  }, [introPaused])

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    volumeRef.current = volume
    mutedRef.current = muted
    try {
      window.localStorage.setItem('flux-volume', String(volume))
      window.localStorage.setItem('flux-muted', muted ? '1' : '0')
    } catch { /* ignore */ }
  }, [volume, muted])

  useEffect(() => {
    try {
      window.localStorage.setItem('flux-sub-size', String(subSize))
      window.localStorage.setItem('flux-sub-bg', String(subBgOpacity))
      window.localStorage.setItem('flux-sub-color', subTextColor)
    } catch { /* ignore */ }
  }, [subSize, subBgOpacity, subTextColor])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const apply = () => {
      if (initialTime && initialTime > 0 && isFinite(video.duration) && video.duration > 0 && video.currentTime < 1) {
        const dur = video.duration
      const resumable = initialTime > 5 && initialTime < dur * 0.92
      if (resumable && !resumeAskedRef.current) {
        resumeAskedRef.current = true
        video.currentTime = initialTime
        if (autoResume) video.play().catch(() => {})
        else video.pause()
      } else {
        video.currentTime = initialTime
      }
      }
    }
    video.addEventListener('loadedmetadata', apply)
    return () => video.removeEventListener('loadedmetadata', apply)
  }, [hlsUrl, initialTime])

  // Resume/restart on demand (page-level overlay)
  useEffect(() => {
    if (!playSignal) return
    const video = videoRef.current
    if (!video) return
    if (!isFinite(video.duration) || video.duration <= 0) return
    video.currentTime = initialTime && initialTime > 0 ? initialTime : 0
    video.play().catch(() => {})
  }, [playSignal, initialTime])

  useEffect(() => {
    if (!progressKey) return
    const video = videoRef.current
    if (!video) return
    let lastT = 0
    const save = () => {
      const t = video.currentTime
      const dur = video.duration
      if (!isFinite(dur) || dur <= 0) return
      if (Math.abs(t - lastT) < 3) return
      lastT = t
      saveProgress(progressKey, {
        t, dur, updatedAt: Date.now(),
        title: title || 'Flux', img: poster,
        type: mediaType, id: tmdbId,
      })
    }
    const iv = setInterval(save, 10000)
    const onEndedH = () => {
      clearProgress(progressKey)
      onEnded?.()
    }
    const onUnload = () => save()
    video.addEventListener('ended', onEndedH)
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    return () => {
      clearInterval(iv)
      video.removeEventListener('ended', onEndedH)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
      save()
    }
  }, [progressKey, title, poster, mediaType, tmdbId, onEnded])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const emit = () => {
      try {
        const st = {
          playing: !video.paused && !video.ended && isFinite(video.duration),
          t: video.currentTime,
          dur: video.duration,
          title, poster, mediaType, tmdbId, season, episode,
        }
        ;(window as any).__fluxPlayerState = st
        window.dispatchEvent(new CustomEvent('flux-player-state'))
      } catch { /* ignore */ }
    }
    const iv = setInterval(emit, 1000)
    video.addEventListener('play', emit)
    video.addEventListener('pause', emit)
    video.addEventListener('ended', emit)
    emit()
    return () => {
      clearInterval(iv)
      video.removeEventListener('play', emit)
      video.removeEventListener('pause', emit)
      video.removeEventListener('ended', emit)
      if ((window as any).__fluxPlayerState?.tmdbId === tmdbId) (window as any).__fluxPlayerState = null
    }
  }, [hlsUrl, title, poster, mediaType, tmdbId, season, episode])

  useEffect(() => {
    const menuOpen = showSettings || showSubs
    menuOpenRef.current = menuOpen
    if (menuOpen) {
      clearTimeout(controlsTimer.current)
      setShowControls(true)
    } else {
      showTemporarily()
    }
  }, [showSettings, showSubs, showTemporarily])

  useEffect(() => {
    const onFs = () => {
      const fs = Boolean(document.fullscreenElement)
      fullscreenRef.current = fs
      setIsFullscreen(fs)
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      clearTimeout(controlsTimer.current)
      clearTimeout(flashTimer.current)
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onWebkitFsIn = () => { fullscreenRef.current = true; setIsFullscreen(true) }
    const onWebkitFsOut = () => { fullscreenRef.current = false; setIsFullscreen(false) }
    video.addEventListener('webkitbeginfullscreen', onWebkitFsIn)
    video.addEventListener('webkitendfullscreen', onWebkitFsOut)
    return () => {
      video.removeEventListener('webkitbeginfullscreen', onWebkitFsIn)
      video.removeEventListener('webkitendfullscreen', onWebkitFsOut)
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onEnter = () => {
      setIsPip(true)
      setShowControls(false)
    }
    const onLeave = () => setIsPip(false)
    video.addEventListener('enterpictureinpicture', onEnter)
    video.addEventListener('leavepictureinpicture', onLeave)
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter)
      video.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [])

  useEffect(() => {
    const onVis = () => {
      if (document.hidden && playing && !document.pictureInPictureElement && videoRef.current && !errorMsg && pipSupported) {
        videoRef.current.requestPictureInPicture?.().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [playing, errorMsg, pipSupported])

   const flash = useCallback((icon: 'play' | 'pause') => {
     if (introTransitionRef.current) return
     setFlashIcon(icon)
     clearTimeout(flashTimer.current)
     flashTimer.current = setTimeout(() => setFlashIcon(null), 650)
   }, [])

  const loadOSSubs = useCallback(async () => {
    if (!tmdbId || !mediaType) return null
    try {
      const q = `/api/subtitles?tmdb_id=${tmdbId}&type=${mediaType}` + (mediaType === 'tv' ? `&season=${season || 1}&episode=${episode || 1}` : '')
      const res = await fetch(q)
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
        const isFr = (s: any) => /fr[a-z]*|franc|frança/i.test((s.lang || '') + ' ' + (s.name || ''))
        const fr = data.subtitles.filter(isFr)
        const frFrance = fr.find((s: any) => /france|fr\b/i.test((s.lang || '') + ' ' + (s.name || '')) && !/canada|québec|quebec/i.test((s.lang || '') + ' ' + (s.name || '')))
        const pick = frFrance || fr[0] || null
        if (pick?.file_id) return pick.file_id
      }
      const localRes = await fetch('/api/subtitles/local')
      const localData = await localRes.json()
      const current = (title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const matchesTitle = (s: any) => {
        const n = ((s.title || s.name || '') + ' ' + (s.file || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const key = current.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length > 2)
        if (!key.length) return true
        return key.filter(k => n.includes(k)).length >= 2
      }
      const localSubs = (localData.subtitles || []).filter(matchesTitle)
      if (localSubs.length) {
        setOsSubs(localSubs)
        const os: SubTrack[] = localSubs.map((s: any, i: number) => ({
          index: i + 100, kind: 'opensubs' as const,
          name: s.name, lang: s.lang, fileId: s.file, local: true,
        }))
        setSubs(prev => {
          const hlsOnly = prev.filter(s => s.kind === 'hls')
          return [...hlsOnly, ...os]
        })
      }
      return null
    } catch {
      return null
    }
  }, [tmdbId, mediaType, title, season, episode])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !hlsUrl) return

    setReady(false)
    setErrorMsg(null)
    setBuffering(false)
    setResumeAsk(false)
    resumeAskedRef.current = false
    introDoneRef.current = false
    maxPosRef.current = 0
    const showIntro = !introSeenRef.current && (!initialTime || initialTime <= 5)
    if (showIntro) introSeenRef.current = true
    setIntroActive(showIntro)
    if (!initialTime || initialTime <= 5) setShowControls(false)
    hlsRef.current?.destroy()
    hlsRef.current = null
    setQualities([])
    setCurrentQuality(-1)
    setSubs([])
    setActiveSub(-1)
    setOsSubs([])
    setAudioTracks([])
    setCurrentAudio(-1)
    userPickedAudio.current = false
    setOsCues([])
    osCuesRef.current = []
    osScaleRef.current = 1
    osFirstStartRef.current = 0
    setOsOffset(0)
    osOffsetRef.current = 0
    setActiveCue(null)
    const savedRate = readSpeed()
    setPlaybackRate(savedRate)
    setVideoZoom(1)

    let cancelled = false
    let gotStream = false

    const onNativeError = () => {
      if (cancelled) return
      if (!video.src && !hlsRef.current) return
      onStreamError?.()
    }
    video.addEventListener('error', onNativeError)

    const playStream = (streamUrl: string) => {
      if (cancelled) return
      gotStream = true
      video.volume = volumeRef.current
      video.muted = mutedRef.current
      const savedRate = readSpeed()
      if (savedRate !== 1) {
        video.playbackRate = savedRate
        setPlaybackRate(savedRate)
      }
      video.onloadedmetadata = () => {
        const d = video.duration
        if (isFinite(d) && d > 0 && d < 120) {
          setErrorMsg(`Flux d'erreur détecté (clip de ${Math.round(d)}s)`)
          onStreamError?.()
        }
      }
      const isM3u8 = streamUrl.includes('.m3u8') || streamUrl.includes('/playlist/') || streamUrl.includes('/m3u8-proxy')
      if (isM3u8 && Hls.isSupported()) {
        const hls = new Hls({
          enableWebVTT: true,
          renderTextTracksNatively: true,
          // Buffering généreux : évite les coups de tampon sur réseau lent
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          maxBufferSize: 60 * 1000 * 1000,
          backBufferLength: 30,
          maxBufferHole: 0.5,
          maxStarvationDelay: 8,
          appendErrorMaxRetry: 10,
          nudgeMaxRetry: 10,
          nudgeOffset: 0.5,
          // Démarre en auto avec une estimation prudente pour un 1er lancement rapide
          abrEwmaDefaultEstimate: 800000,
          abrBandWidthFactor: 0.9,
          abrBandWidthUpFactor: 0.7,
          // Tente de s'auto-réparer avant de déclarer un échec
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 500,
          fragLoadingTimeOut: 10000,
          levelLoadingMaxRetry: 6,
          levelLoadingRetryDelay: 500,
          levelLoadingTimeOut: 10000,
          manifestLoadingMaxRetry: 4,
          manifestLoadingRetryDelay: 500,
          manifestLoadingTimeOut: 15000,
          capLevelToPlayerSize: false,
          autoStartLoad: true,
          enableWorker: true,
        })
        hlsRef.current = hls
        hls.loadSource(streamUrl)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const details = hls.levels?.[0]?.details
          const totalDur = details?.fragments?.length
            ? details.fragments.reduce((a: number, f: any) => a + (f.duration || 0), 0)
            : 0
          if (totalDur > 0 && totalDur < 120) {
            setErrorMsg(`Flux d'erreur détecté (clip de ${Math.round(totalDur)}s)`)
            onStreamError?.()
            hls.destroy()
            return
          }
          setReady(true)
          const levels = hls.levels || []
          if (levels.length > 0) {
            const qs = levels.map((l: any, i: number) => ({
              level: i, height: l.height || 0, width: l.width || 0,
              name: l.height >= 2160 ? '4K' : l.height >= 1440 ? '1440p' : l.height >= 1080 ? '1080p' : l.height >= 720 ? '720p' : l.height >= 480 ? '480p' : l.height ? `${l.height}p` : 'Auto',
            }))
            setQualities([{ level: -1, height: 0, width: 0, name: 'Auto' }, ...qs])
            setCurrentQuality(hls.autoLevelEnabled ? -1 : hls.currentLevel)
            const pref = qualityPrefRef.current
            if (pref && pref !== 'auto') {
              const target = qs.find(q => q.name === pref) || qs.find(q => (pref.includes('4K') ? q.height >= 2160 : q.name === '1080p') && q) || qs.find(q => q.height >= 720)
              if (target) {
                hls.currentLevel = target.level
                setCurrentQuality(target.level)
              }
            }
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
          // Ré-applique automatiquement la langue de sous-titre préférée
          const pref = readSubPref()
          if (pref && pref !== 'off' && !pref.startsWith('os:')) {
            const match = hlsSubs.find(s => s.lang === pref) || hlsSubs.find(s => s.name === pref)
            if (match) {
              hls.subtitleTrack = match.index
              hls.subtitleDisplay = false
              setActiveSub(match.index)
            }
          } else if (pref === 'off') {
            hls.subtitleTrack = -1
            setActiveSub(-1)
          }
        })

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          const tracks = (hls.audioTracks || []).map(t => ({
            id: t.id,
            lang: t.lang || '',
            name: t.name || t.lang || `Piste ${t.id + 1}`,
          }))
          setAudioTracks(tracks)
          if (userPickedAudio.current || tracks.length < 2) return
          const pick = (langs: string[]) => langs.find(l => tracks.some(t => (t.lang + ' ' + t.name).toLowerCase().includes(l)))
          const prefLang = pick(['fr', 'fre', 'fran']) ?? pick(['en', 'eng', 'english'])
          if (prefLang) {
            const pref = tracks.find(t => (t.lang + ' ' + t.name).toLowerCase().includes(prefLang))
            if (pref) {
              hls.audioTrack = pref.id
              setCurrentAudio(pref.id)
            }
          }
        })

        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_e, data) => {
          setCurrentAudio(data.id)
        })

        let hlsErrorRetryCount = 0
        hls.on(Hls.Events.ERROR, (_e, data) => {
          // Erreurs non-fatales : hls.js continue seul, on ne fait rien
          if (!data.fatal) return
          // --- Auto-récupération avant abandon ---
          hlsErrorRetryCount += 1
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsErrorRetryCount <= 5) {
            // Réessaye le chargement après un court délai
            try {
              hls.startLoad()
              return
            } catch { /* fallthrough */ }
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsErrorRetryCount <= 4) {
            try {
              hls.recoverMediaError()
              return
            } catch { /* fallthrough */ }
          }
          setErrorMsg(data.details ? `${data.details}${data.response?.code ? ` (HTTP ${data.response.code})` : ''}` : 'Erreur de lecture')
          onStreamError?.()
          hls.destroy()
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
          if (stream) playStream(rewriteLocalUrl(stream))
          else {
            setErrorMsg('Aucun stream disponible')
            onStreamError?.()
          }
        })
        .catch((e: any) => {
          setErrorMsg(`Impossible de joindre le serveur de flux (${e?.message || 'erreur réseau'})`)
          onStreamError?.()
        })
    } else {
      // Inject a native French subtitle track into local m3u8-proxy streams:
      // resolve the French OS file_id, then append &subs=<file_id> so the proxy
      // adds a real "Français" SUBTITLES rendition (like series streams).
      if (hlsUrl.includes('/m3u8-proxy') || hlsUrl.includes('m3u8-proxy')) {
        loadOSSubs().then(frId => {
          if (cancelled) return
          let url = hlsUrl
          if (frId) {
            const sep = url.includes('?') ? '&' : '?'
            url += `${sep}subs=${encodeURIComponent(frId)}`
          }
          playStream(url)
        })
      } else {
        playStream(hlsUrl)
      }
    }

    loadOSSubs()

    const loadTimeout = setTimeout(() => {
      if (!cancelled && !gotStream) {
        setErrorMsg('Le flux direct met trop de temps à répondre')
        onStreamError?.()
      }
    }, 20000)

    return () => {
      cancelled = true
      clearTimeout(loadTimeout)
      video.removeEventListener('error', onNativeError)
      hlsRef.current?.destroy()
      hlsRef.current = null
      video.src = ''
    }
  }, [hlsUrl, onStreamError, loadOSSubs])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

const onTimeUpdate = () => {
        const t = video.currentTime
        setCurrentTime(t)
        // Room sync: report position ~every 2s when playing
        if (!video.paused) {
          const now = Date.now()
          if (now - (roomLastReportRef.current || 0) > 2000) {
            roomLastReportRef.current = now
            onRoomStateRef.current?.(true, t)
          }
        }
        if (t > maxPosRef.current) maxPosRef.current = t
        if (!video.paused && introDoneRef.current && maxPosRef.current > 1 && t <= 0.5) {
          maxPosRef.current = 0
          introDoneRef.current = false
          fadePendingRef.current = true
          setIntroActive(true)
          setShowControls(false)
        }
        // Near-end detection: show "Next Episode" when in last ~5% of duration
        if (mediaType === 'tv' && duration > 0) {
          const remaining = duration - t
          setNearEnd(remaining > 0 && remaining < Math.min(duration * 0.05, 120))
        } else {
          setNearEnd(false)
        }
        if (hlsSubTrackRef.current >= 0 && video.textTracks) {
        const track = Array.from(video.textTracks).find(
          tr => (tr.kind === 'subtitles' || tr.kind === 'captions') && tr.mode !== 'disabled'
        )
        if (track && track.cues && track.cues.length !== hlsCuesLoadedRef.current) {
          hlsCuesLoadedRef.current = track.cues.length
          const cues: { start: number; end: number; text: string }[] = []
          for (const c of Array.from(track.cues)) {
            cues.push({ start: c.startTime, end: c.endTime, text: (c as any).text || '' })
          }
          osCuesRef.current = cues
          setOsCues(cues)
        }
      }
      const cues = osCuesRef.current
      if (cues.length) {
        let x = t - osOffsetRef.current
        let found: string | null = null
        for (const c of cues) {
          if (x >= c.start && x < c.end) { found = sanitizeSub(c.text); break }
        }
        setActiveCue(found)
      } else {
        setActiveCue(null)
      }
    }
    const onDurationChange = () => setDuration(video.duration || 0)
    const onProgress = () => {
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1))
    }
      const onPlay = () => {
        setPlaying(true); setEnded(false); setBuffering(false)
        onRoomStateRef.current?.(true, video.currentTime)
        if (fadePendingRef.current) {
          fadePendingRef.current = false
          video.classList.remove('flux-fade-in')
          void video.offsetWidth
          video.classList.add('flux-fade-in')
        } else {
          flash('play')
        }
      }
    const onPause = () => { setPlaying(false); flash('pause'); onRoomStateRef.current?.(false, video.currentTime) }
    const onEnded = () => setEnded(true)
    const onWaiting = () => { if (video.currentSrc || hlsRef.current) setBuffering(true) }
    const onStalled = () => { if (video.currentSrc || hlsRef.current) setBuffering(true) }
    const onCanPlay = () => { setBuffering(false) }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('progress', onProgress)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('stalled', onStalled)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('playing', onCanPlay)

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('progress', onProgress)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('stalled', onStalled)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('playing', onCanPlay)
    }
}, [])

  useEffect(() => {
     const onMouseUp = () => { if (dragRef.current) { dragRef.current = false; setIsDragging(false) } }
     document.addEventListener('mouseup', onMouseUp)
     document.addEventListener('touchend', onMouseUp)
     return () => { document.removeEventListener('mouseup', onMouseUp); document.removeEventListener('touchend', onMouseUp) }
    }, [])

  const finishIntro = useCallback(() => {
    if (introDoneRef.current) return
    introDoneRef.current = true
    fadePendingRef.current = true
    introTransitionRef.current = true
    setTimeout(() => {
      setIntroActive(false)
      introTransitionRef.current = false
    }, 320)
    const v = videoRef.current
    if (v) {
      v.muted = mutedRef.current
      v.volume = volumeRef.current
      v.play().catch(() => {})
    }
    if (showControlsRef.current) {
      clearTimeout(controlsTimer.current)
      controlsTimer.current = setTimeout(() => {
        if (playingRef.current && !menuOpenRef.current) setShowControls(false)
      }, 4000)
    }
  }, [])

  const togglePlay = useCallback(() => {
    const intro = introRef.current
    if (introActive && intro) {
      if (intro.paused) intro.play().catch(() => {})
      else intro.pause()
      showTemporarily()
      return
    }
    const video = videoRef.current
    if (!video) return
    playing ? video.pause() : video.play()
    showTemporarily()
  }, [introActive, playing, showTemporarily])

  const handleKeyPlayPause = useCallback(() => {
    const intro = introRef.current
    if (introActive && intro) {
      if (intro.paused) {
        intro.play().catch(() => {})
        flash('play')
      } else {
        intro.pause()
        flash('pause')
      }
      showTemporarily()
      return
    }
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      flash('play')
    } else {
      video.pause()
      flash('pause')
    }
    showTemporarily()
  }, [introActive, flash, showTemporarily])

  const skip = useCallback((delta: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration || 0)
    showTemporarily()
  }, [showTemporarily])

  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef(false)
  const [dragPos, setDragPos] = useState(0)

  const seekTo = useCallback((clientX: number) => {
    const rect = progressRef.current?.getBoundingClientRect()
    if (!rect || !videoRef.current) return
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setDragPos(x * 100)
    videoRef.current.currentTime = x * (videoRef.current.duration || 0)
    showTemporarily()
  }, [showTemporarily])

  const handleSeek = useCallback((e: React.MouseEvent) => { seekTo(e.clientX) }, [seekTo])

  const handleProgressDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    dragRef.current = true
    setIsDragging(true)
    seekTo('touches' in e ? e.touches[0].clientX : e.clientX)
  }, [seekTo])

  const handleProgressMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (dragRef.current) {
      seekTo('touches' in e ? e.touches[0].clientX : e.clientX)
      return
    }
    if ('touches' in e) return
    const rect = progressRef.current?.getBoundingClientRect()
    if (!rect || !videoRef.current) return
    const x = (e.clientX - rect.left) / rect.width
    setSeekHoverTime(x * (videoRef.current.duration || 0))
  }, [seekTo])

  const handleProgressUp = useCallback(() => {
    dragRef.current = false
    setIsDragging(false)
  }, [])

  const handleProgressHover = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) return
    const rect = progressRef.current?.getBoundingClientRect()
    if (!rect || !videoRef.current) return
    const x = (e.clientX - rect.left) / rect.width
    setSeekHoverTime(x * (videoRef.current.duration || 0))
  }, [])

  const handleProgressLeave = useCallback(() => {
    if (!dragRef.current) setSeekHoverTime(null)
  }, [])

  const handleDblClick = useCallback((e: React.MouseEvent) => {
    const video = videoRef.current
    if (!video) return
    const rect = video.getBoundingClientRect()
    const x = e.clientX - rect.left
    const side = x < rect.width / 2 ? 'left' : 'right'
    if (side === 'left') {
      video.currentTime = Math.max(0, video.currentTime - 10)
    } else {
      video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
    }
    setDblFlash({ side, ts: Date.now() })
    clearTimeout(dblTimer.current)
    dblTimer.current = setTimeout(() => setDblFlash(null), 850)
  }, [])

  const startLongPress = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, a')) return
    if (progressRef.current?.contains(target)) return
    suppressMoveUntil.current = Date.now() + 450
    clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      const video = videoRef.current
      if (!video) return
      clearTimeout(tapTimer.current)
      baseRateRef.current = video.playbackRate
      video.playbackRate = 2
      setPlaybackRate(2)
      longPressActive.current = true
      suppressMoveUntil.current = Infinity
    }, 450)
  }, [])

  const cancelLongPress = useCallback(() => {
    clearTimeout(longPressTimer.current)
    if (longPressActive.current) {
      const video = videoRef.current
      if (video) video.playbackRate = baseRateRef.current
      setPlaybackRate(baseRateRef.current)
      longPressActive.current = false
      justLongPressed.current = Date.now()
      suppressMoveUntil.current = Date.now() + 700
    }
  }, [])

  const [brightness, setBrightness] = useState(1)
  const [videoZoom, setVideoZoom] = useState(1)
  const [gestureUi, setGestureUi] = useState<
    { kind: 'seek'; delta: number } | { kind: 'volume'; v: number } | { kind: 'brightness'; v: number } | { kind: 'zoom'; v: number } | null
  >(null)
  const gestureRef = useRef<{
    x: number; y: number; lastDx: number; mode: null | 'seek' | 'volume' | 'brightness' | 'pinch'
    startVolume: number; startBrightness: number; width: number; moved: boolean
    pinchStart: number; startZoom: number
  } | null>(null)
  const gestureUiTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showGestureUi = useCallback((ui: NonNullable<typeof gestureUi>) => {
    setGestureUi(ui)
    clearTimeout(gestureUiTimer.current)
    gestureUiTimer.current = setTimeout(() => setGestureUi(null), 600)
  }, [])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button, input, select, a')) return
    if (progressRef.current?.contains(target)) return
    if (e.touches.length >= 2) {
      const t0 = e.touches[0]
      const t1 = e.touches[1]
      gestureRef.current = {
        x: t0.clientX, y: t0.clientY, lastDx: 0, mode: 'pinch',
        startVolume: 0, startBrightness: 0, width: window.innerWidth,
        moved: false, pinchStart: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        startZoom: videoZoom,
      }
      cancelLongPress()
      clearTimeout(longPressTimer.current)
      return
    }
    const t = e.touches[0]
    gestureRef.current = {
      x: t.clientX, y: t.clientY, lastDx: 0, mode: null,
      startVolume: videoRef.current?.volume ?? 1,
      startBrightness: brightness,
      width: window.innerWidth,
      moved: false,
      pinchStart: 0,
      startZoom: 1,
    }
  }, [brightness, videoZoom, cancelLongPress])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const g = gestureRef.current
    if (!g) return
    if (g.mode === 'pinch') {
      if (e.touches.length < 2) return
      const t0 = e.touches[0]
      const t1 = e.touches[1]
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      const zoom = Math.max(1, Math.min(2.5, g.startZoom * (dist / Math.max(1, g.pinchStart))))
      setVideoZoom(zoom)
      showGestureUi({ kind: 'zoom', v: zoom })
      return
    }
    const t = e.touches[0]
    const dx = t.clientX - g.x
    const dy = t.clientY - g.y
    if (!g.moved && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) g.moved = true
    if (!g.mode) {
      if (!g.moved) return
      cancelLongPress()
      clearTimeout(tapTimer.current)
      g.mode = Math.abs(dx) > Math.abs(dy)
        ? 'seek'
        : (fullscreenRef.current || forceFsRef.current)
          ? (g.x < g.width / 2 ? 'brightness' : 'volume')
          : null
      if (!g.mode) return
    }
    const video = videoRef.current
    if (!video) return
    if (g.mode === 'seek') {
      g.lastDx = dx
      showGestureUi({ kind: 'seek', delta: Math.round(Math.sign(dx) * Math.min(90, Math.abs(dx) / 6)) })
    } else if (g.mode === 'volume') {
      const deltaY = dy / (window.innerHeight * 0.7)
      const v = Math.max(0, Math.min(1, g.startVolume - deltaY))
      video.volume = v
      video.muted = v === 0
      setVolume(v)
      showGestureUi({ kind: 'volume', v })
    } else if (g.mode === 'brightness') {
      const deltaY = dy / (window.innerHeight * 0.7)
      const b = Math.max(0.15, Math.min(1, g.startBrightness - deltaY))
      setBrightness(b)
      showGestureUi({ kind: 'brightness', v: b })
    }
  }, [cancelLongPress, showGestureUi])

  const onTouchEnd = useCallback(() => {
    const g = gestureRef.current
    gestureRef.current = null
    const video = videoRef.current
    if (g?.mode === 'seek' && video) {
      const delta = Math.round(Math.sign(g.lastDx) * Math.min(90, Math.abs(g.lastDx) / 6))
      if (delta !== 0) {
        video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration || 0)
      }
      return
    }
    if (!g || g.moved || g.mode !== null) return
    if (Date.now() - justLongPressed.current < 700) return
    lastTouchTs.current = Date.now()
    const now = Date.now()
    if (now - lastTapTs.current < DBL_TAP_WINDOW) {
      clearTimeout(tapTimer.current)
      lastTapTs.current = 0
      const rect = video?.getBoundingClientRect()
      const x = rect ? g.x - rect.left : 0
      const side = rect && x < rect.width / 2 ? 'left' : 'right'
      if (video) {
        if (side === 'left') video.currentTime = Math.max(0, video.currentTime - 10)
        else video.currentTime = Math.min(video.duration || 0, video.currentTime + 10)
      }
      setDblFlash({ side, ts: Date.now() })
      clearTimeout(dblTimer.current)
      dblTimer.current = setTimeout(() => setDblFlash(null), 850)
      return
    }
    lastTapTs.current = now
    clearTimeout(tapTimer.current)
    tapTimer.current = setTimeout(() => {
      if (Date.now() - justLongPressed.current < 700) return
      if (menuOpenRef.current) return
      toggleOverlay()
    }, TAP_DELAY)
  }, [toggleOverlay])

  const handleVideoClick = useCallback(() => {
    if (Date.now() - lastTouchTs.current < 700) return
    if (Date.now() - justLongPressed.current < 700) return
    toggleOverlay()
  }, [toggleOverlay])

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
    try {
      const name = qualities.find(q => q.level === level)?.name || 'Auto'
      window.localStorage.setItem(QUALITY_KEY, level === -1 ? 'auto' : name)
    } catch {
      // ignore
    }
  }, [qualities])

  const switchSpeed = useCallback((rate: number) => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = rate
    setPlaybackRate(rate)
    setShowSettings(false)
    try {
      window.localStorage.setItem(SPEED_KEY, String(rate))
    } catch {
      // ignore
    }
  }, [])

  const switchAudio = useCallback((id: number) => {
    const hls = hlsRef.current
    if (!hls) return
    userPickedAudio.current = true
    hls.audioTrack = id
    setCurrentAudio(id)
    setShowSettings(false)
  }, [])

  const persistSubSync = useCallback((offset: number) => {
    if (!progressKey) return
    try {
      const all = JSON.parse(localStorage.getItem(SUB_SYNC_KEY) || '{}')
      all[progressKey] = { offset, at: Date.now() }
      localStorage.setItem(SUB_SYNC_KEY, JSON.stringify(all))
    } catch {
      // ignore
    }
  }, [progressKey])

  const setSubOffset = useCallback((v: number) => {
    const next = Math.max(-30, Math.min(30, Math.round(v * 10) / 10))
    setOsOffset(next)
    osOffsetRef.current = next
    persistSubSync(next)
    const video = videoRef.current
    if (video && osCuesRef.current.length) {
      const t = video.currentTime
      let x = t - next
      const sc = osScaleRef.current
      if (sc !== 1) x = (x - osFirstStartRef.current) * sc + osFirstStartRef.current
      let found: string | null = null
      for (const c of osCuesRef.current) {
        if (x >= c.start && x < c.end) { found = sanitizeSub(c.text); break }
      }
      setActiveCue(found)
    }
  }, [persistSubSync])

  const switchSub = useCallback(async (sub: SubTrack) => {
    const hls = hlsRef.current
    if (!hls && sub.kind !== 'opensubs') return

if (sub.kind === 'hls') {
      setActiveSub(sub.index)
      setOsCues([])
      osCuesRef.current = []
      setActiveCue(null)
      hlsSubTrackRef.current = sub.index
      hlsCuesLoadedRef.current = 0
      try {
        window.localStorage.setItem(SUB_PREF_KEY, sub.lang || sub.name || '')
      } catch {
        // ignore
      }
      if (hls) {
        hls.subtitleTrack = sub.index
        hls.subtitleDisplay = false
      }
    } else if (sub.kind === 'opensubs') {
      setActiveSub(sub.index)
      setOsCues([])
      osCuesRef.current = []
      setActiveCue(null)
      hlsSubTrackRef.current = -1
      if (hls) hls.subtitleTrack = -1
      try {
        window.localStorage.setItem(SUB_PREF_KEY, `os:${sub.fileId}`)
      } catch {
        // ignore
      }
      try {
        const durVal = videoRef.current?.duration
        const dur = durVal && isFinite(durVal) && durVal > 60 ? durVal : (duration || 0)
        const res = await fetch(sub.local
          ? `/api/subtitle-download-local?file=${encodeURIComponent(sub.fileId)}`
          : `/api/subtitle-download?file_id=${sub.fileId}${dur ? `&duration=${dur}` : ''}`)
        if (!res.ok) return
        const text = await res.text()
        const video = videoRef.current
        if (!video) return
        let cues = parseVtt(text)
        // auto-scale silencieux : si le VTT fait 90-115% de la durée vidéo, on étire linéairement
        // évite le dérive progressive sans toucher à l'UI (pas d'icône en plus)
        if (cues.length > 5 && dur && isFinite(dur) && dur > 60) {
          const lastEnd = Math.max(...cues.map(c => c.end))
          const firstStart = cues[0]?.start || 0
          if (lastEnd > 60) {
            const scale = dur / lastEnd
            if (scale >= 0.85 && scale <= 1.15 && Math.abs(scale - 1) > 0.015) {
              cues = cues.map(c => ({ ...c, start: (c.start - firstStart) * scale + firstStart, end: (c.end - firstStart) * scale + firstStart }))
            }
          }
        }
        setOsCues(cues)
        osCuesRef.current = cues
        osScaleRef.current = 1
        osFirstStartRef.current = cues[0]?.start || 0
        try {
          const all = JSON.parse(localStorage.getItem(SUB_SYNC_KEY) || '{}')
          const saved = progressKey ? all[progressKey] : null
          if (saved && typeof saved.offset === 'number') {
            setOsOffset(saved.offset)
            osOffsetRef.current = saved.offset
          }
        } catch {}
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
    hlsSubTrackRef.current = -1
    setOsCues([])
    osCuesRef.current = []
    osScaleRef.current = 1
    osFirstStartRef.current = 0
    setActiveCue(null)
    setOsOffset(0)
    osOffsetRef.current = 0
    setActiveSub(-1)
    setShowSubs(false)
    try {
      window.localStorage.setItem(SUB_PREF_KEY, 'off')
    } catch {
      // ignore
    }
  }, [])



   const toggleFullscreen = useCallback(() => {
     const box = boxRef.current
     const video = videoRef.current
     if (!box) return
     const isFs = Boolean(document.fullscreenElement)
      if (!isFs) {
        if (!introActiveRef.current && video && video.paused && !video.ended) video.play()
       if (typeof box.requestFullscreen === 'function') {
         try {
           const p = box.requestFullscreen() as Promise<void> | undefined
           if (p && typeof p.catch === 'function') p.catch(() => {})
         } catch {
         }
       }
     } else {
       if (typeof document.exitFullscreen === 'function') {
         document.exitFullscreen().catch(() => {})
       }
     }
   }, [])

  const togglePip = useCallback(() => {
    const video = videoRef.current
    if (!video || !pipSupported) return
    // 1) WebView Android (APK) : passer par le bridge natif -> enterPictureInPictureMode()
    const bridge = (window as any).Flux
    if (typeof bridge?.onVideoPause === 'function') {
      bridge.requestPip?.()
      return
    }
    // 2) Navigateur desktop/mobile : API Picture-in-Picture standard
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {})
    } else {
      video.requestPictureInPicture?.().catch(() => {})
    }
  }, [pipSupported])

  useEffect(() => {
    const bridge = (window as any).Flux
    if (typeof bridge?.onVideoPause === 'function') {
      // Dans l'APK : demander au natif si le device supporte le PiP
      if (typeof bridge.supportsPip === 'function') {
        setPipSupported(bridge.supportsPip() === true)
      } else if (typeof bridge.pipSupported === 'function') {
        setPipSupported(bridge.pipSupported() === true)
      }
      return
    }
    // Navigateur : l'API standard est dispo ?
    setPipSupported(
      typeof document !== 'undefined' &&
      'pictureInPictureEnabled' in document &&
      document.pictureInPictureEnabled === true
    )
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current
      if (!video) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (menuOpenRef.current) break
          clearTimeout(spaceTimer.current)
          spaceHeld.current = false
          spaceTimer.current = setTimeout(() => {
            spaceHeld.current = true
            const v = videoRef.current
            if (!v) return
            baseRateRef.current = v.playbackRate
            v.playbackRate = 2
            setPlaybackRate(2)
            if (v.paused) v.play()
          }, 280)
          break
        case 'KeyK':
          e.preventDefault()
          if (menuOpenRef.current) break
          handleKeyPlayPause()
          break
        case 'KeyF':
          e.preventDefault()
          toggleFullscreen()
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
        case 'KeyC':
          e.preventDefault()
          toggleCinema()
          break
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        clearTimeout(spaceTimer.current)
        if (spaceHeld.current) {
          spaceHeld.current = false
          const video = videoRef.current
          if (video) video.playbackRate = baseRateRef.current
          setPlaybackRate(baseRateRef.current)
        } else if (!menuOpenRef.current) {
          handleKeyPlayPause()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      clearTimeout(spaceTimer.current)
    }
  }, [toggleFullscreen, handleKeyPlayPause, toggleCinema])

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00'
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = Math.floor(s % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const visualProgress = isDragging ? dragPos : progress
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0
  const hasSubs = subs.length > 0
  const subActive = activeSub >= 0
  const currentSubName = subActive ? subs.find(s => s.index === activeSub)?.name : ''
  const currentQualityName = currentQuality >= 0 ? qualities.find(q => q.level === currentQuality)?.name : ''
  useEffect(() => {
    forceFsRef.current = !!forceFullscreen
  }, [forceFullscreen])

  // Mute the real video while the intro plays (avoids double audio), restore on end
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (introActive) {
      video.muted = true
    } else {
      video.muted = mutedRef.current
      video.volume = volumeRef.current
    }
  }, [introActive])

  const showTitles = isFullscreen ? 'hidden md:block' : 'hidden'
  const isFs = isFullscreen || !!forceFullscreen

  const handleMouseMove = useCallback(() => {
    if (longPressActive.current) return
    if (Date.now() < suppressMoveUntil.current) return
    if (Date.now() - justLongPressed.current < 700) return
    showTemporarily()
  }, [showTemporarily])

  return (
    <div
      ref={boxRef}
       className={cn(
         'bg-black overflow-hidden select-none',
         'absolute inset-0'
       )}
      onMouseMove={handleMouseMove}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onContextMenu={e => e.preventDefault()}
      style={{ touchAction: isFs ? 'none' : 'pan-y', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
    >
      <video ref={videoRef} className="absolute inset-0 w-full h-full bg-black" playsInline crossOrigin="anonymous"
         style={{
           transform: `scale(${videoZoom})`,
           filter: cinemaMode ? 'contrast(1.14) saturate(1.33) brightness(1.06) sepia(0.05) hue-rotate(-2deg)' : 'none',
           transition: 'filter 420ms ease',
           '--sub-size': subSize,
           '--sub-bg': subBgOpacity,
           '--sub-color': subTextColor,
         } as CSSProperties}
          onClick={handleVideoClick} onDoubleClick={handleDblClick} />

      {/* ===== Filtre cinéma : teinte chaude + vignette ===== */}
      {cinemaMode && (
        <>
          <div className="absolute inset-0 pointer-events-none z-[2]" style={{
            background: 'radial-gradient(ellipse 85% 70% at 50% 38%, rgba(255,185,90,0.07), transparent 62%), radial-gradient(ellipse at 50% 100%, rgba(196,0,26,0.09), transparent 55%)',
            mixBlendMode: 'overlay' as any,
            opacity: 1,
            transition: 'opacity 420ms ease',
          }} />
          <div className="absolute inset-0 pointer-events-none z-[2]" style={{
            background: 'radial-gradient(ellipse at center, transparent 56%, rgba(0,0,0,0.52) 100%)',
            opacity: 0.92,
          }} />
          <div className="absolute inset-0 pointer-events-none z-[2] opacity-[0.05]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
          }} />
        </>
      )}

        {/* ===== Intro Flux (vidéo) ===== */}
        {introActive && (
          <video
            ref={introRef}
            src={withBase('/flux-intro.mp4')}
            className="absolute inset-0 w-full h-full bg-black object-cover z-[10]"
            playsInline
            autoPlay
            muted
            onClick={e => { e.stopPropagation(); toggleOverlay() }}
            onDoubleClick={e => { e.stopPropagation(); handleDblClick(e) }}
            onTouchStart={e => e.stopPropagation()}
            onCanPlay={() => { introRef.current?.play().catch(() => finishIntro()) }}
            onPlay={() => setIntroPaused(false)}
            onPause={() => setIntroPaused(true)}
            onEnded={finishIntro}
            onError={finishIntro}
          />
        )}
        {introActive && (
          <button
            onClick={e => { e.stopPropagation(); finishIntro() }}
            className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 border border-white/15 text-white/85 text-[11px] font-semibold backdrop-blur-md transition-all"
          >
            Passer <SkipForward className="w-3.5 h-3.5" />
          </button>
        )}

        {/* ===== Room overlay (plein écran) ===== */}
        {roomOverlay && roomOverlay.members.length > 1 && (
          <RoomOverlay
            members={roomOverlay.members}
            leaderUid={roomOverlay.leaderUid}
            selfUid={roomOverlay.selfUid}
            reactions={roomOverlay.reactions}
            react={roomOverlay.react}
          />
        )}

        {/* ===== Brightness dim overlay (gesture) ===== */}
      {brightness < 1 && (
        <div className="absolute inset-0 z-[15] bg-black pointer-events-none"
          style={{ opacity: (1 - brightness) * 0.75 }} />
      )}

      {/* ===== Gesture feedback UI ===== */}
      {gestureUi && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none flex flex-col items-center gap-2"
          style={{ animation: 'dblflash-pop 600ms ease-out forwards' }}>
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/60 backdrop-blur-md border border-white/20 shadow-2xl flex items-center justify-center">
            {gestureUi.kind === 'seek' && (gestureUi.delta < 0
              ? <RotateCcw className="w-7 h-7 md:w-9 md:h-9 text-white" />
              : <RotateCw className="w-7 h-7 md:w-9 md:h-9 text-white" />)}
            {gestureUi.kind === 'volume' && (gestureUi.v === 0
              ? <VolumeX className="w-7 h-7 md:w-9 md:h-9 text-white" />
              : <Volume2 className="w-7 h-7 md:w-9 md:h-9 text-white" />)}
            {gestureUi.kind === 'brightness' && <Sun className="w-7 h-7 md:w-9 md:h-9 text-white" />}
            {gestureUi.kind === 'zoom' && <ZoomIn className="w-7 h-7 md:w-9 md:h-9 text-white" />}
          </div>
          <span className="text-xs md:text-sm font-bold text-white bg-black/60 backdrop-blur px-2.5 py-1 rounded-full border border-white/20 tabular-nums">
            {gestureUi.kind === 'seek' && `${gestureUi.delta > 0 ? '+' : ''}${gestureUi.delta} s`}
            {gestureUi.kind === 'volume' && `${Math.round(gestureUi.v * 100)} %`}
            {gestureUi.kind === 'brightness' && `${Math.round(gestureUi.v * 100)} %`}
            {gestureUi.kind === 'zoom' && `${Math.round(gestureUi.v * 100)} %`}
          </span>
        </div>
      )}

      {/* ===== Subtitle overlay (OpenSubtitles, custom render + offset) ===== */}
{activeCue && (
         <div className="absolute bottom-[17%] left-1/2 -translate-x-1/2 w-[92%] max-w-3xl z-10 text-center pointer-events-none"
           style={{ paddingBottom: isFs ? 'env(safe-area-inset-bottom, 0px)' : '0px', unicodeBidi: 'plaintext' }}>
          <div
            className="inline-block px-4 py-1.5 md:px-5 md:py-2 text-white font-medium leading-relaxed whitespace-pre-line"
            style={{
              fontSize: `calc(${subSize} * 1.125rem)`,
              lineHeight: '1.4',
              color: subTextColor,
              background: subBgOpacity > 0
                ? `linear-gradient(to bottom, rgba(0,0,0,${subBgOpacity * 0.85}), rgba(0,0,0,${subBgOpacity * 0.55}))`
                : 'transparent',
              backdropFilter: subBgOpacity > 0 ? 'blur(6px)' : 'none',
              WebkitBackdropFilter: subBgOpacity > 0 ? 'blur(6px)' : 'none',
              borderRadius: '10px',
              textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 2px 12px rgba(0,0,0,0.7)',
              animation: 'subfade 180ms ease-out',
            }}
            dangerouslySetInnerHTML={{ __html: activeCue }}
          />
        </div>
      )}

      {/* ===== Double-click seek feedback ===== */}
      {dblFlash && (
        <div
          key={dblFlash.ts}
          className={cn('absolute top-1/2 -translate-y-1/2 z-30 pointer-events-none flex flex-col items-center gap-2', dblFlash.side === 'left' ? 'left-[16%]' : 'right-[16%]')}
          style={{ animation: 'dblflash-pop 850ms ease-out forwards' }}
        >
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/60 backdrop-blur-md border border-white/20 shadow-2xl flex items-center justify-center">
            {dblFlash.side === 'left'
              ? <RotateCcw className="w-7 h-7 md:w-9 md:h-9 text-white" />
              : <RotateCw className="w-7 h-7 md:w-9 md:h-9 text-white" />}
          </div>
          <span className="text-xs md:text-sm font-bold text-white bg-black/60 backdrop-blur px-2.5 py-1 rounded-full border border-white/20">
            {dblFlash.side === 'left' ? '−10 s' : '+10 s'}
          </span>
        </div>
      )}

      {/* ===== Speed badge (top-right, small, shows while 2x or custom rate) ===== */}
      {playbackRate !== 1 && (
        <span className="absolute top-2 right-2 md:top-3 md:right-3 z-20 text-[9px] md:text-[10px] font-bold uppercase tracking-wider bg-primary/90 text-white px-1.5 py-0.5 rounded-md shadow-[0_0_10px_hsl(var(--primary)/0.5)] backdrop-blur-sm">
          {playbackRate}x
        </span>
      )}

      {/* ===== Top gradient + title (fullscreen only) ===== */}
      <div className={cn('absolute inset-x-0 top-0 z-20 transition-opacity duration-300', isFs ? '' : 'hidden', showControls ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/95 via-black/40 to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-3 px-4 pb-14 md:px-6"
          style={{ paddingTop: isFs ? 'max(1rem, env(safe-area-inset-top, 0px))' : '1rem' }}>
          <button onClick={forceFullscreen ? onExitFullscreen : () => window.history.back()}
            className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-black/50 hover:bg-black/80 text-white/90 hover:text-white border border-white/15 backdrop-blur-md flex items-center justify-center transition-all hover:scale-105">
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          {title && (
            <span className="text-sm md:text-lg font-semibold text-white/95 truncate drop-shadow-lg max-w-[70%]">{title}</span>
          )}
          {mediaType === 'tv' && season && episode && (
            <span className="text-xs md:text-sm font-bold text-white/80 px-2 py-0.5 rounded-md bg-primary/90 text-white shadow-[0_0_10px_hsl(var(--primary)/0.4)] whitespace-nowrap ml-2">
              S{season} · E{episode}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {currentQuality >= 0 && qualities[currentQuality + 1] && (
              <span className={cn(
                'inline-flex text-[10px] font-bold uppercase tracking-wide px-1.5 md:px-2 py-0.5 rounded-md text-white backdrop-blur',
                currentQualityName?.startsWith('4K') ? 'bg-purple-600/90 border border-purple-400/40'
                : currentQualityName?.startsWith('1080') ? 'bg-emerald-600/90 border border-emerald-400/40'
                : currentQualityName?.startsWith('720') ? 'bg-amber-500/90 border border-amber-400/40'
                : 'bg-white/10 border border-white/15 text-white/80'
              )}>
                {currentQualityName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===== Error banner ===== */}
      {errorMsg && (
        <div className="absolute top-3 inset-x-0 z-30 flex justify-center px-4">
          <div className="bg-red-600/95 backdrop-blur text-white text-[11px] md:text-sm px-4 py-2 rounded-full shadow-xl border border-red-400/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            {errorMsg}
          </div>
        </div>
      )}

      {/* ===== Loading spinner (source changement / stream fetch) ===== */}
      {!ready && !errorMsg && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 md:w-20 md:h-20 rounded-full border-4 border-white/15 border-t-primary animate-spin shadow-xl" />
        </div>
      )}

      {/* ===== Rebuffering spinner (déjà joué, réseau en retard) ===== */}
      {ready && !errorMsg && buffering && !showControls && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-full border-4 border-white/15 border-t-primary animate-spin shadow-xl" />
          </div>
        </div>
      )}

      {/* ===== Center flash feedback ===== */}
      {flashIcon && !ended && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl"
            style={{ animation: 'flash-pop 650ms ease-out forwards' }}>
            {flashIcon === 'play'
              ? <Play className="w-9 h-9 md:w-11 md:h-11 text-white fill-white ml-1" />
              : <Pause className="w-9 h-9 md:w-11 md:h-11 text-white fill-white" />}
          </div>
        </div>
      )}

      {/* ===== Center play/pause button (visible with controls) ===== */}
      {showControls && ready && !ended && !flashIcon && (
        <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Lecture'}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-16 h-16 md:w-24 md:h-24 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-black/65 hover:scale-105 active:scale-95 transition-all">
          {buffering
            ? <div className="w-8 h-8 md:w-11 md:h-11 rounded-full border-4 border-white/20 border-t-primary animate-spin" />
            : (introActive ? !introPaused : playing)
              ? <Pause className="w-8 h-8 md:w-11 md:h-11 text-white fill-white" />
              : <Play className="w-8 h-8 md:w-11 md:h-11 text-white fill-white ml-0.5 md:ml-1" />}
        </button>
      )}

      {/* ===== Near-end / Next Episode button ===== */}
      {nearEnd && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 animate-in fade-in slide-up-4 duration-300">
          <button onClick={() => onEnded?.()}
            className="flex items-center gap-2 bg-primary/90 hover:bg-primary text-white text-sm font-bold px-5 py-2.5 rounded-full backdrop-blur-md border border-white/20 shadow-xl transition-all hover:scale-105 active:scale-95">
            <SkipForward className="w-4 h-4 fill-current" />
            Épisode suivant
          </button>
        </div>
      )}

      {ended && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
          <button onClick={togglePlay} className="flex flex-col items-center gap-3 text-white/80 hover:text-white transition-colors">
            <span className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              <Play className="w-8 h-8 md:w-10 md:h-10 fill-white/90 ml-0.5" />
            </span>
            <span className="text-sm font-semibold tracking-wide">Revoir</span>
          </button>
        </div>
      )}

      {/* ===== Bottom controls ===== */}
      <div className={cn('absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300', showControls ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent pointer-events-none" />
        <div className="relative px-3 pt-16 md:px-5"
          style={{ paddingBottom: isFs ? 'max(0.5rem, env(safe-area-inset-bottom, 0px))' : '0.5rem' }}>

          {/* Progress bar (YouTube style) */}
          <div ref={progressRef}
            onClick={handleSeek}
            onMouseDown={handleProgressDown}
            onMouseMove={handleProgressMove}
            onMouseUp={handleProgressUp}
            onMouseLeave={handleProgressLeave}
            onTouchStart={(e) => { handleProgressDown(e); e.preventDefault() }}
            onTouchMove={(e) => { handleProgressMove(e); e.preventDefault() }}
            onTouchEnd={handleProgressUp}
            className="group/progress relative w-full cursor-pointer mb-2 md:mb-3 h-4 flex items-center"
          >
            <div className="relative w-full h-1 md:h-[5px] group-hover/progress:h-[6px] bg-white/15 rounded-full transition-all duration-150">
              <div className="absolute inset-y-0 left-0 bg-white/25 rounded-full transition-[width] duration-100" style={{ width: `${bufferedPct}%` }} />
              <div className="absolute inset-y-0 left-0 bg-primary rounded-full shadow-[0_0_8px_hsl(var(--primary)/0.5)] transition-[width] duration-100" style={{ width: `${visualProgress}%` }} />
              {isDragging && (
                <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 md:w-3.5 md:h-3.5 bg-white rounded-full shadow-[0_0_0_3px_hsl(var(--primary)/0.8)]"
                  style={{ left: `${visualProgress}%`, marginLeft: '-6px' }} />
              )}
              {!isDragging && seekHoverTime == null && (
                <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 md:w-3 md:h-3 bg-primary rounded-full shadow-[0_0_0_3px_hsl(var(--primary)/0.6)] opacity-0 group-hover/progress:opacity-100 scale-0 group-hover/progress:scale-100 transition-all duration-150"
                  style={{ left: `${progress}%`, marginLeft: '-5px' }} />
              )}
            </div>
            {seekHoverTime != null && !isDragging && (
              <div className="absolute -top-7 left-0 -translate-x-1/2 bg-black/90 backdrop-blur border border-white/10 text-white text-[11px] px-2 py-0.5 rounded shadow-lg pointer-events-none whitespace-nowrap"
                style={{ left: `${(seekHoverTime / (duration || 1)) * 100}%` }}>
                {formatTime(seekHoverTime)}
              </div>
            )}
            {isDragging && (
              <div className="absolute -top-7 left-0 -translate-x-1/2 bg-black/90 backdrop-blur border border-white/10 text-white text-[11px] px-2 py-0.5 rounded shadow-lg pointer-events-none whitespace-nowrap"
                style={{ left: `${dragPos}%` }}>
                {formatTime((dragPos / 100) * (duration || 0))}
              </div>
            )}
          </div>

          {/* Buttons row (YouTube layout) */}
          <div className="flex items-center gap-0.5 md:gap-1">
            <button onClick={togglePlay}
              className="text-white/90 hover:text-white transition-all p-1.5 md:p-2 hover:scale-110 active:scale-95">
              {(introActive ? !introPaused : playing) ? <Pause className={cn('fill-current', isFs ? 'w-6 h-6 md:w-7 md:h-7' : 'w-5 h-5 md:w-6 md:h-6')} /> : <Play className={cn('fill-current ml-0.5', isFs ? 'w-6 h-6 md:w-7 md:h-7' : 'w-5 h-5 md:w-6 md:h-6')} />}
            </button>

            <button onClick={() => skip(-10)} aria-label="Reculer 10 s"
              className="text-white/80 hover:text-white transition-all p-1.5 md:p-2 hover:scale-110 active:scale-95">
              <RotateCcw className={cn(isFs ? 'w-5 h-5 md:w-6 md:h-6' : 'w-4 h-4 md:w-5 md:h-5')} />
            </button>
            <button onClick={() => skip(10)} aria-label="Avancer 10 s"
              className="text-white/80 hover:text-white transition-all p-1.5 md:p-2 hover:scale-110 active:scale-95">
              <RotateCw className={cn(isFs ? 'w-5 h-5 md:w-6 md:h-6' : 'w-4 h-4 md:w-5 md:h-5')} />
            </button>

            <span className={cn('text-white/60 font-mono tabular-nums ml-1', isFs ? 'text-sm md:text-base' : 'text-[11px] md:text-xs')}>
              {formatTime(currentTime)} <span className="text-white/35">/</span> {formatTime(duration)}
            </span>

            <div className="flex-1" />

            {/* Quality pill (mobile fullscreen) */}
            {isFs && currentQuality >= 0 && (
              <span className="md:hidden text-[10px] font-bold uppercase bg-white/10 border border-white/15 px-1.5 py-0.5 rounded text-white/80">
                {qualities.find(q => q.level === currentQuality)?.name}
              </span>
            )}

            {hasSubs && (
              <div className="relative">
                <button onClick={() => { setShowSubs(v => !v); setShowSettings(false) }}
                  className={cn('text-white/80 hover:text-white transition-colors p-1.5 md:p-2 relative hover:scale-110', subActive && 'text-primary')}>
                  <Captions className={cn(isFs ? 'w-5 h-5 md:w-6 md:h-6' : 'w-4 h-4 md:w-5 md:h-5')} />
                  {subActive && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />}
                </button>
                {showSubs && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowSubs(false)} />
                    <div className="absolute bottom-full right-0 mb-2 z-20 min-w-[180px] bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 shadow-2xl max-h-[70vh] overflow-y-auto">
                      <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold">Sous-titres</p>
                      <button onClick={disableSubs}
                        className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', !subActive ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                        {!subActive && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                        Aucun
                      </button>
                      {subs.map(sub => (
                        <button key={`${sub.kind}-${sub.index}`} onClick={() => switchSub(sub)}
                          className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', activeSub === sub.index ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                          {activeSub === sub.index && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                          <span className="truncate">{sub.name}</span>
                          {sub.kind === 'opensubs' && <span className="ml-auto text-[10px] text-white/30">{sub.local ? 'Local' : 'OS'}</span>}
                        </button>
                      ))}
                      {subActive && subs.find(s => s.index === activeSub)?.kind !== undefined && (
                        <>
<p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold mt-1 border-t border-white/10 pt-2">
                          Décalage {osOffset === 0 ? '' : osOffset > 0 ? `+${osOffset}s` : `${osOffset}s`}
                        </p>
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <span className="text-[10px] text-white/40 tabular-nums flex-shrink-0">-30s</span>
                          <input type="range" min={-30} max={30} step={0.1} value={osOffset}
                            onChange={e => setSubOffset(Number(e.target.value))}
                            className="flex-1 accent-primary h-1 cursor-pointer" aria-label="Décalage des sous-titres" />
                          <span className="text-[10px] text-white/40 tabular-nums flex-shrink-0">+30s</span>
                        </div>
                          <div className="flex items-center justify-center pb-1">
                            <button onClick={() => setSubOffset(0)}
                              className="px-3 py-1 text-[10px] rounded-lg bg-white/10 hover:bg-white/20 text-white/60 transition-colors">Réinitialiser</button>
                          </div>
                        </>
                      )}
                      <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold mt-1 border-t border-white/10 pt-2">Apparence</p>
                      <div className="px-3 py-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-white/40">Taille</span>
                          <span className="text-[10px] text-white/60 tabular-nums">{Math.round(subSize * 100)} %</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-white/40">A-</span>
                          <input type="range" min={0.6} max={2.2} step={0.1} value={subSize}
                            onChange={e => setSubSize(Number(e.target.value))}
                            className="flex-1 accent-primary h-1 cursor-pointer" aria-label="Taille des sous-titres" />
                          <span className="text-[10px] text-white/40">A+</span>
                        </div>
                      </div>
                      <div className="px-3 py-1.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-white/40">Fond</span>
                          <span className="text-[10px] text-white/60 tabular-nums">{Math.round(subBgOpacity * 100)} %</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-white/40">Clair</span>
                          <input type="range" min={0} max={1} step={0.05} value={subBgOpacity}
                            onChange={e => setSubBgOpacity(Number(e.target.value))}
                            className="flex-1 accent-primary h-1 cursor-pointer" aria-label="Opacité du fond des sous-titres" />
                          <span className="text-[10px] text-white/40">Foncé</span>
                        </div>
                      </div>
                      <div className="px-3 py-1.5">
                        <span className="text-[10px] text-white/40 block mb-1.5">Couleur</span>
                        <div className="flex items-center gap-2">
                          {(['#ffffff', '#ffe066', '#7ce8ff', '#8affa8', '#ff9e9e'].map(c => (
                            <button key={c} onClick={() => setSubTextColor(c)} aria-label={`Couleur ${c}`}
                              className={cn('w-6 h-6 rounded-full border-2 transition-transform hover:scale-110',
                                subTextColor === c ? 'border-white scale-110' : 'border-white/20')}
                              style={{ background: c }} />
                          )))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="relative">
              <button onClick={() => { setShowSettings(v => !v); setShowSubs(false) }}
                className={cn('text-white/80 hover:text-white transition-colors p-1.5 md:p-2 hover:scale-110', showSettings && 'text-primary')}>
                <Settings className={cn(isFs ? 'w-5 h-5 md:w-6 md:h-6' : 'w-4 h-4 md:w-5 md:h-5')} />
              </button>
              {showSettings && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSettings(false)} />
                  <div className="absolute bottom-full right-0 mb-2 z-20 min-w-[170px] bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 shadow-2xl max-h-70 overflow-y-auto">
                    {hlsSources && hlsSources.length > 1 && (
                      <>
                        <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold">Source</p>
                        {hlsSources.map(src => (
                          <button key={src.index} onClick={() => { onSwitchSource?.(src.index); setShowSettings(false) }}
                            className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', activeSourceIdx === src.index ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                            {activeSourceIdx === src.index && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                            <span className="truncate">{src.name}</span>
                          </button>
                        ))}
                        <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold mt-1 border-t border-white/10 pt-2">Qualité</p>
                      </>
                    )}
                    {!hlsSources || hlsSources.length <= 1 ? (
                      <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold">Qualité</p>
                    ) : null}
                    {qualities.map(q => (
                      <button key={q.level} onClick={() => switchQuality(q.level)}
                        className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', currentQuality === q.level ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                        {currentQuality === q.level && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                        {q.name}
                      </button>
                    ))}
                    {audioTracks.length > 0 && (
                      <>
                        <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold mt-1 border-t border-white/10 pt-2">Audio</p>
                        {audioTracks.map(t => (
                          <button key={t.id} onClick={() => switchAudio(t.id)}
                            className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', currentAudio === t.id ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                            {currentAudio === t.id && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                            {t.name}
                          </button>
                        ))}
                      </>
                    )}
                    <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold mt-1 border-t border-white/10 pt-2">Vitesse</p>
                    {SPEEDS.map(rate => (
                      <button key={rate} onClick={() => switchSpeed(rate)}
                        className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', playbackRate === rate ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                        {playbackRate === rate && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                        {rate}x
                      </button>
                    ))}
                    <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40 font-semibold mt-1 border-t border-white/10 pt-2 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> Cinéma
                    </p>
                    <button onClick={() => { toggleCinema(); setShowSettings(false) }}
                      className={cn('flex items-center justify-between w-full text-left px-3 py-2.5 text-xs rounded-xl border transition-all',
                        cinemaMode ? 'bg-amber-500/15 text-amber-300 border-amber-400/30' : 'bg-white/[0.04] text-white/70 border-white/10 hover:bg-white/10')}>
                      <span className="flex items-center gap-2"><Film className="w-4 h-4" /> {cinemaMode ? 'Activé' : 'Désactivé'}</span>
                      <span className={cn('w-9 h-5 rounded-full p-0.5 flex items-center transition-colors', cinemaMode ? 'bg-amber-500 justify-end' : 'bg-white/15 justify-start')}>
                        <span className="w-4 h-4 rounded-full bg-white shadow" />
                      </span>
                    </button>
                    <p className="px-3 pt-1 text-[10px] leading-relaxed text-white/30">
                      Couleurs plus chaudes & contrastées + basses profondes et dialogues plus présents. Désactive-le pour un rendu plus neutre.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Cinéma : filtre image + son immersif */}
            <button onClick={toggleCinema} aria-label="Mode Cinéma" title={cinemaMode ? 'Désactiver Cinéma' : 'Activer Cinéma'}
              className={cn('flex items-center gap-1 md:gap-1.5 px-2 md:px-2.5 py-1 md:py-1.5 rounded-full border text-[11px] md:text-xs font-bold transition-all ml-1',
                cinemaMode
                  ? 'bg-amber-500/15 text-amber-300 border-amber-400/40 shadow-[0_0_14px_rgba(245,158,11,0.32)]'
                  : 'bg-white/[0.04] text-white/55 border-white/10 hover:bg-white/[0.08] hover:text-white/90')}>
              <Film className={cn('w-3.5 h-3.5 md:w-4 md:h-4', cinemaMode && 'fill-amber-300/30')} />
              <span className="hidden sm:inline">Cinéma</span>
              <span className={cn('w-1.5 h-1.5 rounded-full', cinemaMode ? 'bg-amber-400 animate-pulse' : 'bg-white/25')} />
            </button>

            {/* Volume (desktop) */}
            <div className="hidden md:flex items-center gap-1.5 ml-1">
              <button onClick={() => { if (videoRef.current) { videoRef.current.muted = !muted; setMuted(!muted) } }}
                className="text-white/80 hover:text-white transition-colors p-1.5 md:p-2 hover:scale-110 active:scale-95">
                {muted || volume === 0 ? <VolumeX className="w-4 h-4 md:w-5 md:h-5" /> : <Volume2 className="w-4 h-4 md:w-5 md:h-5" />}
              </button>
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-20 h-1 accent-primary appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full" />
            </div>

            <button onClick={() => { setShowDownload(v => !v); setShowSettings(false); setShowSubs(false) }}
              className="text-white/80 hover:text-white transition-all p-1.5 md:p-2 hover:scale-110 active:scale-95">
              <Download className={cn(isFs ? 'w-5 h-5 md:w-6 md:h-6' : 'w-4 h-4 md:w-5 md:h-5')} />
            </button>

            <button onClick={togglePip} disabled={!pipSupported} aria-label="Picture in picture"
              className={cn(
                'transition-all p-1.5 md:p-2',
                pipSupported
                  ? 'text-white/80 hover:text-white hover:scale-110 active:scale-95'
                  : 'text-white/25 cursor-not-allowed opacity-50',
                isPip && pipSupported && 'text-primary'
              )}>
              <PictureInPicture2 className={cn(isFs ? 'w-5 h-5 md:w-6 md:h-6' : 'w-4 h-4 md:w-5 md:h-5')} />
            </button>

            <button onClick={forceFullscreen ? onExitFullscreen : toggleFullscreen}
              className="text-white/80 hover:text-white transition-all p-1.5 md:p-2 hover:scale-110 active:scale-95">
              {isFs
                ? <Minimize className={cn(isFs ? 'w-5 h-5 md:w-6 md:h-6' : 'w-4 h-4 md:w-5 md:h-5')} />
                : <Maximize className={cn(isFs ? 'w-5 h-5 md:w-6 md:h-6' : 'w-4 h-4 md:w-5 md:h-5')} />}
            </button>
          </div>
        </div>
      </div>

      {/* ===== Download modal ===== */}
      {showDownload && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="absolute inset-0" onClick={() => !downloading && setShowDownload(false)} />
          <div className="relative w-full max-w-sm bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-white">Télécharger le film</h3>
              </div>
              {!downloading && (
                <button onClick={() => setShowDownload(false)} className="text-white/50 hover:text-white transition-colors p-1">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <p className="text-[11px] text-white/50 mb-2">Piste audio</p>
            <div className="max-h-32 overflow-y-auto mb-3 space-y-1">
              <button onClick={() => setDownloadAudio('')}
                className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', !downloadAudio ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                {!downloadAudio && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                Par défaut
              </button>
              {audioTracks.map(t => (
                <button key={t.id} onClick={() => setDownloadAudio(t.lang)}
                  className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', downloadAudio === t.lang ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                  {downloadAudio === t.lang && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>

            <p className="text-[11px] text-white/50 mb-2">Sous-titres intégrés</p>
            <div className="max-h-32 overflow-y-auto mb-4 space-y-1">
              <button onClick={() => setDownloadSub('')}
                className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', !downloadSub ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                {!downloadSub && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                Aucun
              </button>
              {osSubs.map((s, i) => (
                <button key={i} onClick={() => setDownloadSub(s.file_id ?? '')}
                  className={cn('flex items-center gap-2 w-full text-left px-3 py-2 text-xs rounded-lg transition-colors', downloadSub === s.file_id ? 'bg-primary/20 text-primary font-medium' : 'text-white/70 hover:bg-white/5')}>
                  {downloadSub === s.file_id && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="truncate">{s.lang}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => {
                setDownloading(true)
                const match = hlsUrl.match(/season=(\d+)&episode=(\d+)/)
                const season = match?.[1] || '1'
                const episode = match?.[2] || '1'
                const qs = new URLSearchParams({
                  type: mediaType, id: String(tmdbId), season, episode,
                  audio: downloadAudio, sub: downloadSub, title: title || 'video',
                })
                const a = document.createElement('a')
                a.href = `/api/download-movie?${qs}`
                a.download = ''
                a.click()
                setTimeout(() => setDownloading(false), 2000)
                toast({
                  title: 'Téléchargement lancé',
                  description: title || 'video',
                  variant: 'success',
                })
              }}
              disabled={downloading}
              className={cn('w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
                downloading ? 'bg-white/10 text-white/50 cursor-not-allowed' : 'bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]')}>
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {downloading ? 'Téléchargement lancé…' : 'Télécharger (MP4)'}
            </button>
            <p className="mt-3 text-[10px] text-white/35 leading-relaxed">
              Le fichier (MP4, vidéo + audio choisi + sous-titres intégrés) est préparé à la volée — le téléchargement peut prendre plusieurs dizaines de minutes pour un film complet. Laissez la page ouverte.
            </p>
          </div>
        </div>
      )}

      {/* Flash animation keyframes */}
      <style>{`
        @keyframes flash-pop {
          0% { transform: scale(0.6); opacity: 0; }
          25% { transform: scale(1.1); opacity: 1; }
          70% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0; }
        }
        @keyframes dblflash-pop {
          0% { transform: scale(0.4); opacity: 0; }
          20% { transform: scale(1.15); opacity: 1; }
          35% { transform: scale(1); }
           75% { transform: scale(1); opacity: 1; }
           100% { transform: scale(0.9); opacity: 0; }
          }
       `}</style>
    </div>
  )
}
