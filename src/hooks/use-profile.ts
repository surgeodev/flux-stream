import { useCallback, useEffect, useRef, useState } from 'react'

export type Profile = {
  uid: string
  ip: string
  name: string
  avatar: string
  createdAt: number
  lastSeen: number
  likes?: { type: 'movie' | 'tv'; id: number; title: string; img?: string; ts: number }[]
}

export const AVATAR_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899', '#64748b']

export type LikeInfo = { uid: string; name: string; avatar: string }

type Listener = () => void
let sharedProfile: Profile | null | undefined = undefined
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach(fn => {
    try { fn() } catch { /* ignore */ }
  })
}

export function getSharedProfile(): Profile | null | undefined {
  return sharedProfile
}

export async function refreshSharedProfile(): Promise<Profile | null> {
  try {
    const r = await fetch('/api/profile')
    const d = await r.json()
    sharedProfile = d.profile ?? null
    notify()
    return sharedProfile ?? null
  } catch {
    sharedProfile = null
    notify()
    return null
  }
}

export async function uploadAvatar(file: File): Promise<{ avatar: string } | null> {
  try {
    const dataUrl = await resizeImage(file, 512, 512)
    const r = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataUrl }),
    })
    const d = await r.json()
    if (d.ok && d.avatar) {
      sharedProfile = { ...(sharedProfile || {}), avatar: d.avatar } as Profile
      notify()
      return d
    }
    return null
  } catch {
    return null
  }
}

function resizeImage(file: File, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // 1) Lecture orientation-aware (EXIF des photos mobile) quand dispo
    const readOriented: Promise<ImageBitmap | HTMLImageElement> =
      typeof createImageBitmap === 'function'
        ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadViaImage())
        : loadViaImage()

    function loadViaImage(): Promise<HTMLImageElement> {
      return new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onerror = () => rej(new Error('read error'))
        reader.onload = () => {
          const img = new Image()
          img.onload = () => res(img)
          img.onerror = () => rej(new Error('img error'))
          img.src = String(reader.result)
        }
        reader.readAsDataURL(file)
      })
    }

    readOriented.then(img => {
      const iw = 'width' in img ? img.width : (img as HTMLImageElement).naturalWidth
      const ih = 'height' in img ? img.height : (img as HTMLImageElement).naturalHeight
      if (!iw || !ih) { reject(new Error('bad image')); return }

      // 2) Crop carré centré à la taille cible (les avatars sont affichés en ronds)
      const side = Math.min(maxW, maxH)
      const scale = Math.max(side / iw, side / ih)
      const cw = side / scale, ch = side / scale
      const sx = (iw - cw) / 2, sy = (ih - ch) / 2

      const canvas = document.createElement('canvas')
      canvas.width = side
      canvas.height = side
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no ctx')); return }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img as CanvasImageSource, sx, sy, cw, ch, 0, 0, side, side)

      // 3) PNG avec transparence si l'image source est sans fond, sinon JPEG
      const hasAlpha = file.type === 'image/png' || file.type === 'image/webp'
      try {
        resolve(hasAlpha
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', 0.9))
      } catch {
        resolve(canvas.toDataURL('image/png'))
      }
    }).catch(err => reject(err))
  })
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null | undefined>(sharedProfile)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const didInitRef = useRef(false)

  useEffect(() => {
    const fn = () => setProfile(sharedProfile)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])

  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    if (sharedProfile === undefined) refreshSharedProfile()
  }, [])

  const refresh = useCallback(() => refreshSharedProfile(), [])

  const save = useCallback(async (name: string, avatar: string): Promise<boolean> => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), avatar }),
      })
      const d = await r.json()
      if (d.profile) {
        sharedProfile = d.profile
        notify()
        setProfile(d.profile)
      }
      return Boolean(d.profile)
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const toggleLike = useCallback(async (item: { type: 'movie' | 'tv'; id: number; title: string; img?: string }): Promise<boolean> => {
    try {
      const r = await fetch('/api/profile/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: item.type, id: item.id, title: item.title, img: item.img || '' }),
      })
      const d = await r.json()
      window.dispatchEvent(new Event('flux-likes-changed'))
      refreshSharedProfile()
      return Boolean(d.liked)
    } catch {
      return false
    }
  }, [])

  const fetchLikers = useCallback(async (type: 'movie' | 'tv', id: number): Promise<LikeInfo[]> => {
    try {
      const r = await fetch(`/api/likes/${type}/${id}`)
      const d = await r.json()
      return d.likers ?? []
    } catch {
      return []
    }
  }, [])

  return { profile, loading, error, refresh, save, toggleLike, fetchLikers }
}

export function useLikers(type: 'movie' | 'tv', id: number, enabled = true) {
  const { fetchLikers } = useProfile()
  const [likers, setLikers] = useState<LikeInfo[]>([])

  useEffect(() => {
    if (!enabled || !id) return
    let cancelled = false
    const load = () => fetchLikers(type, id).then(list => { if (!cancelled) setLikers(list) })
    load()
    window.addEventListener('flux-likes-changed', load)
    return () => {
      cancelled = true
      window.removeEventListener('flux-likes-changed', load)
    }
  }, [fetchLikers, type, id, enabled])

  return { likers, count: likers.length, refresh: () => fetchLikers(type, id).then(setLikers) }
}