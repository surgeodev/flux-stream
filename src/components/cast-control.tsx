import { useEffect, useRef, useState } from 'react'
import { Cast, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ZoomIn, CircleX, LoaderCircle, Power } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CastControlProps {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title?: string
  season?: number
  episode?: number
}

type DeviceState = {
  playing: boolean
  time: number
  dur: number
  vol: number | null
  zoomPct: number | null
  sub: string | null
  subList: string[]
  qual: string | null
  qualList: string[]
  rate: number | null
  title: string
  sid: string | null
}

type Device = {
  uid: string
  label: string
  online: boolean
  lastSeen: number
  state: DeviceState
}

export function CastControl({ tmdbId, mediaType, title, season, episode }: CastControlProps) {
  const [devices, setDevices] = useState<Device[]>([])
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Device | null>(null)
  const [requesting, setRequesting] = useState(false)
  const timerRef = useRef<number | null>(null)
  const pollRef = useRef<number | null>(null)

  const mediaPayload = (sid?: string) => ({
    uid: target?.uid,
    sid,
    type: mediaType,
    id: String(tmdbId),
    title: title || '',
    season: season ? String(season) : '',
    episode: episode ? String(episode) : '',
  })

  const refresh = async () => {
    try {
      const res = await fetch('/api/cast/devices', { signal: AbortSignal.timeout(2000) })
      const data = await res.json()
      const list: Device[] = (data.devices || []).map((d: any) => ({
        uid: d.uid,
        label: d.label,
        online: d.online,
        lastSeen: d.lastSeen,
        state: d.state || null,
      }))
      setDevices(list)
      return list
    } catch {
      return []
    }
  }

  useEffect(() => {
    refresh()
    timerRef.current = window.setInterval(() => {
      refresh()
      // si on a une cible castée, vérifier qu'elle broadcast bien la session
      if (target && !devices.find(d => d.uid === target.uid)) {
        // TV offline → on relance la découverte au prochain refresh
      }
    }, 1400)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, devices])

  const tvs = devices.filter(d => d.online)

  const castRequest = async (tv?: Device) => {
    setRequesting(true)
    try {
      const chosen = tv || tvs[0]
      if (!chosen) { alert("Aucune télévision FLUX détectée sur le réseau."); setRequesting(false); return }
      const params = new URLSearchParams({
        uid: chosen.uid,
        type: mediaType,
        id: String(tmdbId),
        title: title || '',
      })
      if (season) params.set('season', String(season))
      if (episode) params.set('episode', String(episode))
      const res = await fetch('/api/cast/request', { method: 'POST', body: params })
      const data = await res.json()
      if (data.sid) {
        setTarget(chosen)
        // attendre que la TV accepte (state.sid === sid)
        const deadline = Date.now() + 6000
        const wait = setInterval(async () => {
          const list = await refresh()
          const d = list.find(x => x.uid === chosen.uid && x.state && x.state.sid === data.sid)
          if (d) {
            setTarget(d as Device)
            clearInterval(wait)
            setRequesting(false)
          } else if (Date.now() > deadline) {
            clearInterval(wait)
            setRequesting(false)
            alert("La télévision n'a pas pris le cast — vérifiez qu'elle est sur l'accueil FLUX.")
          }
        }, 700)
        pollRef.current = wait as any
      }
    } catch (e) { setRequesting(false) }
  }

  const cmd = async (c: string, val: any = {}, opts?: { sid?: string }) => {
    if (!target) return
    try {
      const params = new URLSearchParams({
        uid: target.uid,
        sid: opts?.sid || target.state?.sid || '',
        cmd: c,
        payload: JSON.stringify(val),
      })
      await fetch('/api/cast/cmd', { method: 'POST', body: params })
    } catch {}
  }

  const s = target?.state
  const isPlaying = !!s?.playing
  const pct = s && s.dur > 0 ? (s.time / s.dur) * 100 : 0

  if (!open) {
    const connected = tvs.length > 0
    return (
      <button
        onClick={() => { refresh(); setOpen(true) }}
        aria-label="Diffuser sur la TV"
        className={cn(
          'absolute top-3 right-3 z-30 rounded-full w-10 h-10 border flex items-center justify-center',
          connected ? 'bg-primary/90 border-white/20 text-white hover:bg-primary/100'
                     : 'bg-black/50 border-white/10 text-white/50 cursor-not-allowed',
        )}
        title="Diffuser sur la TV FLUX">
        <Cast className="w-5 h-5" />
        {connected && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-black" />}
      </button>
    )
  }

  return (
    <div className="absolute top-3 right-3 z-40 w-72 rounded-2xl border border-white/20 bg-black/80 backdrop-blur-md shadow-2xl overflow-hidden">
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <span className="font-semibold flex items-center gap-2 text-sm">
          <Cast className="w-4 h-4" /> Diffuser sur TV
        </span>
        <button onClick={() => { setOpen(false); if (pollRef.current) clearInterval(pollRef.current as any); if (timerRef.current) clearInterval(timerRef.current as any) }}
          className="p-1 rounded hover:bg-white/10">
          <CircleX className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {!target && !requesting && (
        <div className="p-3 space-y-2">
          {tvs.length === 0
            ? <div className="text-xs text-white/50">Recherche d'une télévision FLUX…</div>
            : tvs.map(tv => (
              <button key={tv.uid} onClick={() => castRequest(tv)}
                className="w-full text-left px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm">
                <span className="font-medium">{tv.label || 'TV'}</span>
                <span className="ml-2 text-white/50">({tv.online ? 'en ligne' : 'hors ligne'})</span>
              </button>
            ))}
        </div>
      )}

      {(requesting || (target && !s)) && (
        <div className="p-4 flex items-center justify-center gap-2 text-sm text-white/70">
          <LoaderCircle className="w-4 h-4 animate-spin" /> Envoi à la TV…
        </div>
      )}

      {target && s && (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span className="truncate">{s.title || target.label}</span>
            <span className="ml-auto">{s.playing ? 'Lecture' : 'Pause'}</span>
          </div>

          {s.dur > 0 && (
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
          )}

          <div className="grid grid-cols-5 gap-1.5">
            <Btn onClick={() => cmd('play')}><Play className="w-4 h-4" /></Btn>
            <Btn onClick={() => cmd('pause')}><Pause className="w-4 h-4" /></Btn>
            <Btn2 onClick={() => cmd('seekrel', { d: -10 })}><SkipBack className="w-4 h-4" />-10</Btn2>
            <Btn2 onClick={() => cmd('seekrel', { d: 10 })}>+10<SkipForward className="w-4 h-4" /></Btn2>
            <Btn2 onClick={() => { if ((s?.vol ?? 1) <= 0.05) cmd('volabs', { v: 1 }); else cmd('mute', { on: true }) }}>{s?.vol != null && s.vol < 0.01 ? <VolumeX /> : <Volume2 />}</Btn2>
            <div className="col-span-5 flex items-center gap-1.5">
              <Btn onClick={() => cmd('vol', { d: -0.1 })}>-</Btn>
              <span className="text-[11px] text-white/70 w-10 text-center">{(s?.vol != null ? Math.round(s.vol * 100) : '?')} %</span>
              <Btn onClick={() => cmd('vol', { d: 0.1 })}>+</Btn>
              <Btn onClick={() => cmd('zoom', { d: -0.25 })}><ZoomIn className="w-4 h-4 rotate-180" /></Btn>
              <Btn onClick={() => cmd('zoomabs', { s: 1 })}>1:1</Btn>
              <Btn onClick={() => cmd('zoom', { d: 0.25 })}><ZoomIn className="w-4 h-4" /></Btn>
            </div>

            <div className="col-span-5">
              <div className="text-[10px] uppercase text-white/40 mb-1">Sous-titres</div>
              <div className="flex flex-wrap gap-1">
                <Btn small onClick={() => cmd('suboff')} active={!s?.sub || s.sub === 'none'}>OFF</Btn>
                {(s?.subList || []).map((lang, i) => (
                  <Btn key={lang + i} small onClick={() => cmd('sub', { i })}
                    active={s.sub === lang}>
                    {lang}
                  </Btn>
                ))}
              </div>
            </div>

            {s.qualList && s.qualList.length > 0 && (
              <div className="col-span-5">
                <div className="text-[10px] uppercase text-white/40 mb-1">Qualité source</div>
                <div className="flex flex-wrap gap-1">
                  {s.qualList.map((q, i) => (
                    <Btn key={q + i} small onClick={() => cmd('qual', { i })} active={s.qual === q}>
                      {q}
                    </Btn>
                  ))}
                </div>
              </div>
            )}

            <div className="col-span-5 flex gap-1.5">
              <Btn2 onClick={() => cmd('home')}>
                <Power className="w-4 h-4" /> Retour accueil TV
              </Btn2>
              <Btn2 onClick={() => { setTarget(null); if (pollRef.current) clearInterval(pollRef.current as any); cmd('stopcast') }}
                className="ml-auto">
                <CircleX className="w-4 h-4" /> Déconnecter
              </Btn2>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Btn({ onClick, children, small, active }: { onClick: () => void; children: any; small?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full bg-white/10 border border-white/15 hover:bg-white/20 text-white transition',
        small ? 'px-2.5 py-1 text-[11px]' : 'w-10 h-10 justify-center',
        active && 'bg-primary/90 border-white/30',
      )}>
      {children}
    </button>
  )
}
function Btn2({ onClick, children, className }: { onClick: () => void; children: any; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('rounded-full bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/15', className)}>
      {children}
    </button>
  )
}
