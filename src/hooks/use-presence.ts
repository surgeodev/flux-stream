import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { getMovie, getTVShow } from '@/hooks/use-tmdb'

let UID = ''
function getUid(): string {
  if (!UID) {
    try {
      UID = localStorage.getItem('flux-uid') || ''
      if (!UID) {
        UID = Math.random().toString(36).slice(2) + Date.now().toString(36)
        localStorage.setItem('flux-uid', UID)
      }
    } catch {
      UID = 'anon'
    }
  }
  return UID
}

type Payload = { path: string; label: string; kind: string; id: string; s: string; e: string; img?: string; playing?: string; t?: string; dur?: string }

function fire(action: string, payload?: unknown) {
  try {
    window.dispatchEvent(new CustomEvent('flux-remote', { detail: { action, payload } }))
  } catch { /* ignore */ }
}

function playerExtra(): { img?: string; playing?: string; t?: string; dur?: string } {
  try {
    const st = (window as any).__fluxPlayerState
    if (!st || typeof st !== 'object') return {}
    return {
      img: st.poster || '',
      playing: st.playing ? '1' : '0',
      t: String(Math.floor(st.t || 0)),
      dur: String(Math.floor(st.dur || 0)),
    }
  } catch {
    return {}
  }
}

function parseLocation(pathname: string, search: string, title?: string): Payload | null {
  const q = new URLSearchParams(search)
  if (pathname === '/watch') {
    const type = q.get('type') || 'movie'
    const id = q.get('id') || q.get('tmdb') || ''
    const t = q.get('title') || title || (type === 'tv' ? `Série ${id}` : `Film ${id}`)
    const s = q.get('s') || ''
    const e = q.get('e') || ''
    const label = type === 'tv' && s && e
      ? `Regarde « ${t} » · S${s} E${e}`
      : `Regarde « ${t} »`
    return { path: pathname, label, kind: type, id, s, e }
  }
  if (pathname === '/') return { path: pathname, label: 'Sur l’accueil', kind: 'page', id: '', s: '', e: '' }
  if (pathname === '/search') return { path: pathname, label: `Recherche : ${q.get('q') || ''}`, kind: 'page', id: '', s: '', e: '' }
  if (pathname === '/playlist') return { path: pathname, label: 'Consulte sa playlist', kind: 'page', id: '', s: '', e: '' }
  if (pathname === '/categories') return { path: pathname, label: 'Parcourt les catégories', kind: 'page', id: '', s: '', e: '' }
  return null
}

export function PresenceReporter() {
  const [location] = useLocation()
  const pathname = location.split('?')[0]
  const search = location.includes('?') ? location.slice(location.indexOf('?')) : ''
  const lastRef = useRef('')
  const bannedRef = useRef(false)

  const tvMatch = pathname.match(/^\/tv\/(\d+)/)
  const movieMatch = pathname.match(/^\/movie\/(\d+)/)
  const { data: tvTitle } = useQuery({
    queryKey: ['tv', tvMatch?.[1]],
    queryFn: () => getTVShow(Number(tvMatch![1])),
    enabled: !!tvMatch,
    staleTime: Infinity,
  })
  const { data: movieTitle } = useQuery({
    queryKey: ['movie', movieMatch?.[1]],
    queryFn: () => getMovie(Number(movieMatch![1])),
    enabled: !!movieMatch,
    staleTime: Infinity,
  })

  useEffect(() => {
    let p: Payload | null = null
    if (tvMatch) p = { path: pathname, label: `Fiche : ${tvTitle?.title || tvMatch[1]}`, kind: 'tv', id: tvMatch[1], s: '', e: '' }
    else if (movieMatch) p = { path: pathname, label: `Fiche : ${movieTitle?.title || movieMatch[1]}`, kind: 'movie', id: movieMatch[1], s: '', e: '' }
    else p = parseLocation(pathname, search)
    if (!p || pathname === '/admin') return
    if (p.label === lastRef.current && p.id === '') return

    if (pathname !== '/watch') {
      try { (window as any).__fluxPlayerState = null } catch { /* ignore */ }
    }
    lastRef.current = p.label
    postPresence({ ...p, ...playerExtra() })
  }, [location, tvTitle?.title, movieTitle?.title])

  useEffect(() => {
    const iv = setInterval(() => {
      if (bannedRef.current) return
      let p: Payload | null = null
      if (tvMatch) p = { path: pathname, label: `Fiche : ${tvTitle?.title || tvMatch[1]}`, kind: 'tv', id: tvMatch[1], s: '', e: '' }
      else if (movieMatch) p = { path: pathname, label: `Fiche : ${movieTitle?.title || movieMatch[1]}`, kind: 'movie', id: movieMatch[1], s: '', e: '' }
      else p = parseLocation(pathname, search)
      if (!p || pathname === '/admin') return
      postPresence({ ...p, ...playerExtra() })
    }, 5000)
    return () => clearInterval(iv)
  }, [pathname, search, tvTitle?.title, movieTitle?.title])

  return null
}

async function postPresence(p: Payload) {
  try {
    const body = new URLSearchParams({ uid: getUid(), ...p } as Record<string, string>)
    const res = await fetch('/api/presence', { method: 'POST', body, keepalive: true, signal: AbortSignal.timeout(8000) })
    const data = await res.json().catch(() => ({}))
    if (data?.banned) {
      fire('ban', { reason: data.reason || '' })
      return
    }
    if (Array.isArray(data?.commands)) {
      for (const c of data.commands) {
        if (c?.action) fire(c.action, c?.payload)
      }
    }
  } catch {
    try {
      navigator.sendBeacon('/api/presence', new URLSearchParams({ uid: getUid(), ...p } as Record<string, string>))
    } catch { /* ignore */ }
  }
}
