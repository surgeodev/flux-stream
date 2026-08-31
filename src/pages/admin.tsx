import { useCallback, useEffect, useState } from 'react'
import { useSearch } from 'wouter'
import { Layout } from '@/components/layout'
import { getMovie, getTVShow, imgPath } from '@/hooks/use-tmdb'
import { useQuery } from '@tanstack/react-query'
import { Eye, Wifi, User, RefreshCw, LogOut, ShieldCheck, History, Circle, MonitorSmartphone, X, Pause, Play, ExternalLink, AlertTriangle, Zap, Ban, UserX } from 'lucide-react'
import { cn } from '@/lib/utils'

type Entry = {
  uid: string
  ip: string
  ua: string
  path: string
  label: string
  kind: string
  id: string
  s: string
  e: string
  img: string
  playing: string
  t: number
  dur: number
  firstSeen: number
  lastSeen: number
}

type HistoryEntry = { uid: string; ip: string; ua: string; label: string; kind: string; id: string; s: string; e: string; img: string; ts: number }
type BannedEntry = { uid: string; ip: string; reason: string; ts: number }

const KEY_STORE = 'flux-admin-key'
const PRESETS = [
  { label: 'Interstellar', url: '/movie/157336' },
  { label: 'La Casa de Papel S1E14', url: '/watch?type=tv&id=71446&s=1&e=14' },
  { label: 'La Casa de Papel S1E15', url: '/watch?type=tv&id=71446&s=1&e=15' },
  { label: 'Loki S1E1', url: '/watch?type=tv&id=84958&s=1&e=1' },
  { label: 'Loki S1E2', url: '/watch?type=tv&id=84958&s=1&e=2' },
  { label: 'Loki S1E3', url: '/watch?type=tv&id=84958&s=1&e=3' },
  { label: 'Loki S1E4', url: '/watch?type=tv&id=84958&s=1&e=4' },
  { label: 'Loki S1E5', url: '/watch?type=tv&id=84958&s=1&e=5' },
  { label: 'Loki S1E6', url: '/watch?type=tv&id=84958&s=1&e=6' },
  { label: 'Loki S2E1', url: '/watch?type=tv&id=84958&s=2&e=1' },
  { label: 'Accueil', url: '/' },
]

function ago(ts: number, now: number): string {
  const d = Math.max(0, Math.round(now - ts))
  if (d < 5) return 'à l’instant'
  if (d < 60) return `il y a ${d}s`
  if (d < 3600) return `il y a ${Math.floor(d / 60)}min`
  return `il y a ${Math.floor(d / 3600)}h`
}

function fmt(s: number): string {
  if (!isFinite(s) || s <= 0) return ''
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

const KIND_STYLE: Record<string, string> = {
  tv: 'bg-purple-500/15 text-purple-300 border-purple-400/30',
  movie: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  page: 'bg-white/5 text-white/50 border-white/10',
}

function kindIcon(kind: string) {
  if (kind === 'tv') return <TvIcon />
  if (kind === 'movie') return <ClapIcon />
  return <CompassIcon />
}
function TvIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="2" y="7" width="20" height="15" rx="2" /><polyline points="17 2 12 7 7 2" /></svg>
}
function ClapIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="2" y1="20" x2="22" y2="20" /></svg>
}
function CompassIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></svg>
}

function usePoster(kind: string, id: string): string | null {
  const { data } = useQuery({
    queryKey: ['admin-poster', kind, id],
    queryFn: async () => {
      if (!id || (kind !== 'tv' && kind !== 'movie')) return null
      const m: any = kind === 'tv' ? await getTVShow(Number(id)) : await getMovie(Number(id))
      return m?.img || null
    },
    enabled: !!id && (kind === 'tv' || kind === 'movie'),
    staleTime: Infinity,
  })
  return data || null
}

function IconBtn({ onClick, title, danger, children }: { onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn('w-8 h-8 rounded-lg border flex items-center justify-center transition-colors',
        danger ? 'border-red-500/25 text-red-400 hover:bg-red-500/15' : 'border-white/10 text-white/70 hover:bg-white/10 hover:text-white')}
    >
      {children}
    </button>
  )
}

function UserCard({ u, now, keyToken, onBanned }: { u: Entry; now: number; keyToken: string; onBanned: () => void }) {
  const [panel, setPanel] = useState<'redirect' | 'notice' | 'ban' | null>(null)
  const [path, setPath] = useState('')
  const [msg, setMsg] = useState('')
  const [reason, setReason] = useState('')
  const poster = usePoster(u.kind, u.id) || u.img

  const sendCmd = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    await fetch('/api/admin/command', {
      method: 'POST',
      body: new URLSearchParams({ key: keyToken, uid: u.uid, action, payload: JSON.stringify(payload) }),
    }).catch(() => {})
  }, [keyToken, u.uid])

  const doBan = useCallback(async () => {
    await fetch('/api/admin/ban', {
      method: 'POST',
      body: new URLSearchParams({ key: keyToken, uid: u.uid, reason }),
    }).catch(() => {})
    setPanel(null)
    setReason('')
    onBanned()
  }, [keyToken, u.uid, reason, onBanned])

  const pct = u.dur > 0 ? Math.min(100, (u.t / u.dur) * 100) : 0
  const isPlaying = u.playing === '1'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-4 md:p-5">
      <div className="flex items-center gap-3 mb-2.5">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/40 to-purple-500/40 flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold">{u.ip}</span>
            <span className="text-[11px] text-white/40">{u.ua}</span>
          </div>
          <div className="text-[11px] text-white/35 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <MonitorSmartphone className="w-3 h-3" />
            connecté {ago(u.firstSeen, now)} · vu {ago(u.lastSeen, now)}
          </div>
        </div>
        <span className={cn('flex items-center gap-1.5 text-[11px] font-medium rounded-full border px-2.5 py-1', u.lastSeen > now - 30 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' : 'bg-amber-500/15 text-amber-300 border-amber-400/30')}>
          <span className={cn('w-1.5 h-1.5 rounded-full', u.lastSeen > now - 30 ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400')} />
          {u.lastSeen > now - 30 ? 'en ligne' : 'idle'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {poster ? (
          <img src={imgPath(poster, 'w92')} alt="" className="w-12 h-[68px] rounded-lg object-cover border border-white/10 shrink-0" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className={cn('inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm max-w-full', KIND_STYLE[u.kind] || KIND_STYLE.page)}>
            {kindIcon(u.kind)}
            <span className="truncate">{u.label}</span>
          </div>
          {(u.dur > 0 || isPlaying) && (
            <div className="mt-2 flex items-center gap-2">
              <span className={cn('flex items-center gap-1 text-[10px] font-semibold rounded-full border px-1.5 py-0.5', isPlaying ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' : 'bg-white/5 text-white/50 border-white/10')}>
                {isPlaying ? <><Play className="w-2.5 h-2.5" /> lecture</> : <><Pause className="w-2.5 h-2.5" /> en pause</>}
              </span>
              {u.dur > 0 && (
                <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                </div>
              )}
              <span className="text-[10px] text-white/40 tabular-nums shrink-0">{fmt(u.t)}{u.dur > 0 ? ` / ${fmt(u.dur)}` : ''}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/5 flex-wrap">
        <IconBtn title="Pause" onClick={() => sendCmd('pause')}><Pause className="w-4 h-4" /></IconBtn>
        <IconBtn title="Play" onClick={() => sendCmd('play')}><Play className="w-4 h-4" /></IconBtn>
        <IconBtn title="Rediriger" onClick={() => { setPanel(panel === 'redirect' ? null : 'redirect'); setPath('') }}><ExternalLink className="w-4 h-4" /></IconBtn>
        <IconBtn title="Fausse erreur" onClick={() => { setPanel(panel === 'notice' ? null : 'notice'); setMsg('') }}><AlertTriangle className="w-4 h-4" /></IconBtn>
        <IconBtn title="Kick (déconnecter)" onClick={() => sendCmd('kick', { message: 'Tu as été déconnecté par l’admin.' })}><Zap className="w-4 h-4" /></IconBtn>
        <IconBtn title="Ban" danger onClick={() => { setPanel(panel === 'ban' ? null : 'ban'); setReason('') }}><Ban className="w-4 h-4" /></IconBtn>
      </div>

      {panel === 'redirect' && (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.url} onClick={() => { setPath(p.url); sendCmd('redirect', { url: p.url }) }}
                className="text-[11px] rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/70 hover:bg-white/15 hover:text-white transition-colors">
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={path} onChange={e => setPath(e.target.value)} placeholder="/movie/157336 ou /watch?type=tv&id=71446&s=1&e=14"
              className="flex-1 min-w-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-white/30 focus:outline-none focus:border-primary/50" />
            <button onClick={() => path.trim() && sendCmd('redirect', { url: path.trim() })}
              className="rounded-lg bg-primary hover:bg-primary/90 text-white px-3 py-2 text-xs font-semibold shrink-0">
              Envoyer
            </button>
          </div>
        </div>
      )}

      {panel === 'notice' && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-black/30 p-3 space-y-2">
          <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Message de l'erreur (ex: Flux introuvable 😈)"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-white/30 focus:outline-none focus:border-red-400/50" />
          <div className="flex gap-2">
            <button onClick={() => sendCmd('notice', { title: 'Erreur du flux', message: msg || 'Flux introuvable 😈' })}
              className="rounded-lg bg-red-500/80 hover:bg-red-500 text-white px-3 py-2 text-xs font-semibold flex-1">
              Afficher l'erreur
            </button>
          </div>
        </div>
      )}

      {panel === 'ban' && (
        <div className="mt-3 rounded-xl border border-red-500/25 bg-black/30 p-3 space-y-2">
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif (ex: trop de trolls 🚫)"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground placeholder:text-white/30 focus:outline-none focus:border-red-400/50" />
          <button onClick={doBan}
            className="rounded-lg bg-red-600 hover:bg-red-500 text-white px-3 py-2 text-xs font-semibold w-full">
            Bannir ce flux
          </button>
        </div>
      )}
    </div>
  )
}

export default function Admin() {
  const search = useSearch()
  const params = new URLSearchParams(search)
  const urlKey = params.get('key') || ''
  const [key, setKey] = useState(urlKey || (typeof window !== 'undefined' ? sessionStorage.getItem(KEY_STORE) || '' : ''))
  const [input, setInput] = useState('')
  const [state, setState] = useState<'login' | 'loading' | 'ok' | 'error'>(urlKey || (typeof window !== 'undefined' ? sessionStorage.getItem(KEY_STORE) || '' : '') ? 'loading' : 'login')
  const [online, setOnline] = useState<Entry[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [banned, setBanned] = useState<BannedEntry[]>([])
  const [now, setNow] = useState(Date.now() / 1000)
  const [paused, setPaused] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const load = useCallback(async (k: string, opts?: { initial?: boolean }) => {
    if (opts?.initial) setState('loading')
    try {
      const res = await fetch(`/api/admin/presence?key=${encodeURIComponent(k)}`, { signal: AbortSignal.timeout(8000) })
      if (res.status === 401) {
        sessionStorage.removeItem(KEY_STORE)
        setKey('')
        setState('login')
        if (opts?.initial) setErrorMsg('Mauvaise clé.')
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      sessionStorage.setItem(KEY_STORE, k)
      setKey(k)
      setOnline(data.online || [])
      setHistory(data.history || [])
      setBanned(data.banned || [])
      setNow(data.now || Date.now() / 1000)
      setState('ok')
    } catch {
      if (opts?.initial) {
        setState('error')
        setErrorMsg('Impossible de contacter le serveur.')
      }
    }
  }, [])

  useEffect(() => {
    if (key) load(key, { initial: true })
  }, [key, load])

  useEffect(() => {
    if (state !== 'ok') return
    const iv = setInterval(() => {
      setNow(Date.now() / 1000)
      if (!paused) load(key)
    }, 5000)
    return () => clearInterval(iv)
  }, [state, key, paused, load])

  const logout = () => {
    sessionStorage.removeItem(KEY_STORE)
    setKey('')
    setState('login')
    setOnline([])
    setHistory([])
    setBanned([])
  }

  const unban = useCallback(async (uid: string) => {
    await fetch('/api/admin/unban', { method: 'POST', body: new URLSearchParams({ key, uid }) }).catch(() => {})
    load(key)
  }, [key, load])

  if (state !== 'ok') {
    return (
      <Layout>
        <div className="flex min-h-[70vh] items-center justify-center px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Espace Admin</h1>
                <p className="text-xs text-white/40">Réservé au boss du site</p>
              </div>
            </div>
            {state === 'loading' ? (
              <div className="py-10 flex flex-col items-center gap-3">
                <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                <p className="text-xs text-white/40">Chargement…</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); if (input.trim()) load(input.trim(), { initial: true }) }}
                className="space-y-3"
              >
                <input
                  type="password"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Clé secrète…"
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-foreground placeholder:text-white/30 focus:outline-none focus:border-primary/50 focus:bg-white/10"
                />
                {state === 'error' && (
                  <p className="text-xs text-red-400 flex items-center gap-1.5">
                    <X className="w-3.5 h-3.5" /> {errorMsg}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="w-full rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-50 text-white py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Entrer
                </button>
              </form>
            )}
          </div>
        </div>
      </Layout>
    )
  }

  const onlineSorted = [...online].sort((a, b) => b.lastSeen - a.lastSeen)
  const hero = onlineSorted[0] && (onlineSorted[0].kind === 'tv' || onlineSorted[0].kind === 'movie') && onlineSorted[0].dur > 0 ? onlineSorted[0] : null

  return (
    <Layout>
      <div className="container mx-auto px-3 md:px-6 pt-24 md:pt-28 pb-16 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                Admin
                <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border', online.length > 0 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' : 'bg-white/5 text-white/40 border-white/10')}>
                  {online.length} connecté{online.length > 1 ? 's' : ''}
                </span>
              </h1>
              <p className="text-xs text-white/40">Surveillance + télécommande</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setPaused(p => !p); if (paused) load(key) }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors flex items-center gap-1.5"
            >
              {paused ? <Circle className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
              {paused ? 'Reprendre' : 'Live'}
            </button>
            <button
              onClick={logout}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Quitter
            </button>
          </div>
        </div>

        {hero && (
          <div className="mb-6 rounded-2xl overflow-hidden border border-white/10 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/40 z-10" />
            <img src={imgPath(hero.img || '', 'w342')} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
            <div className="relative z-20 p-5 md:p-7 flex items-center gap-5">
              <img src={imgPath(hero.img || '', 'w342')} alt="" className="w-20 md:w-28 h-[112px] md:h-[158px] rounded-xl object-cover border border-white/20 shadow-2xl hidden sm:block" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-semibold mb-1">En ce moment</p>
                <h2 className="text-lg md:text-2xl font-bold text-white truncate">{hero.label}</h2>
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <span className={cn('flex items-center gap-1.5 text-[11px] font-semibold rounded-full border px-2.5 py-1', hero.playing === '1' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : 'bg-amber-500/20 text-amber-300 border-amber-400/30')}>
                    {hero.playing === '1' ? <><Play className="w-3 h-3" /> en lecture</> : <><Pause className="w-3 h-3" /> en pause</>}
                  </span>
                  <span className="text-xs text-white/60 tabular-nums">{fmt(hero.t)}{hero.dur > 0 ? ` / ${fmt(hero.dur)}` : ''}</span>
                  <span className="text-xs text-white/40 font-mono">{hero.ip}</span>
                </div>
                {hero.dur > 0 && (
                  <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden max-w-md">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (hero.t / hero.dur) * 100)}%` }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {onlineSorted.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-10 text-center text-sm text-white/40">
              Personne en ligne pour l’instant. Quand quelqu’un ouvre le site, il apparaît ici.
            </div>
          )}
          {onlineSorted.map((u) => (
            <UserCard key={u.uid} u={u} now={now} keyToken={key} onBanned={() => load(key)} />
          ))}
        </div>

        {banned.length > 0 && (
          <div className="mt-8">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white/70 mb-3">
              <Ban className="w-4 h-4 text-red-400" /> Bannis ({banned.length})
            </h2>
            <div className="rounded-2xl border border-red-500/20 bg-white/[0.02] overflow-hidden divide-y divide-white/5">
              {banned.map(b => (
                <div key={b.uid} className="px-4 py-3 flex items-center gap-3 text-sm">
                  <Ban className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="font-mono text-xs text-white/60 shrink-0">{b.uid.slice(0, 10)}…</span>
                  <span className="font-mono text-xs text-white/45 hidden sm:inline">{b.ip}</span>
                  <span className="flex-1 min-w-0 text-xs text-white/55 truncate">{b.reason || 'Aucun motif'}</span>
                  <span className="text-[11px] text-white/35 shrink-0">banni {ago(b.ts, now)}</span>
                  <button onClick={() => unban(b.uid)}
                    className="shrink-0 rounded-lg border border-white/10 bg-white/5 hover:bg-white/15 text-white/70 text-[11px] font-semibold px-2.5 py-1 flex items-center gap-1">
                    <UserX className="w-3.5 h-3.5" /> Débannir
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white/70 mb-3">
            <History className="w-4 h-4" /> Activité récente
          </h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            {history.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-white/40">Aucune activité pour l’instant.</div>
            ) : (
              <ul className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
                {[...history].reverse().map((h, i) => (
                  <li key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <span className="font-mono text-[11px] text-white/40 w-14 shrink-0">{ago(h.ts, now)}</span>
                    <span className="text-[11px] text-white/45 shrink-0">{h.ip}</span>
                    <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[12px] min-w-0', KIND_STYLE[h.kind] || KIND_STYLE.page)}>
                      {kindIcon(h.kind)}
                      <span className="truncate">{h.label}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
