import { useCallback } from 'react'

export type WatchProgress = {
  t: number
  dur: number
  updatedAt: number
  title: string
  img?: string
  type: 'movie' | 'tv'
  id: number
}

const KEY = 'flux-watch-progress'

export function formatWatchTime(t: number): string {
  if (!isFinite(t) || t <= 0) return ''
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = Math.floor(t % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function readAll(): Record<string, WatchProgress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

export function getProgress(progressKey: string): WatchProgress | null {
  return readAll()[progressKey] || null
}

export function saveProgress(progressKey: string, p: WatchProgress): void {
  try {
    const all = readAll()
    all[progressKey] = p
    const entries = Object.entries(all).filter(([, v]) => v.dur > 0)
    entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries.slice(0, 20))))
    try {
      window.dispatchEvent(new Event('flux-progress-changed'))
    } catch {
      // ignore
    }
  } catch {
    // storage full or unavailable
  }
}

export function clearProgress(progressKey: string): void {
  try {
    const all = readAll()
    delete all[progressKey]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

export function getAllProgress(): WatchProgress[] {
  return getAllProgressWithKeys().map(e => e.p)
}

export function getAllProgressWithKeys(): { key: string; p: WatchProgress }[] {
  try {
    const all = readAll()
    return Object.entries(all)
      .filter(([, p]) => p.dur > 0 && p.t > 5 && p.t < p.dur * 0.92)
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .map(([key, p]) => ({ key, p }))
  } catch {
    return []
  }
}

export function useWatchProgress(progressKey: string) {
  const loadInitial = useCallback((): number => {
    const p = getProgress(progressKey)
    if (!p) return 0
    if (p.t < 5 || p.t > p.dur * 0.92) return 0
    return p.t
  }, [progressKey])

  const persist = useCallback((t: number, dur: number, meta: Omit<WatchProgress, 't' | 'dur' | 'updatedAt'>) => {
    saveProgress(progressKey, { t, dur, updatedAt: Date.now(), ...meta })
  }, [progressKey])

  const clear = useCallback(() => clearProgress(progressKey), [progressKey])

  return { loadInitial, persist, clear }
}
