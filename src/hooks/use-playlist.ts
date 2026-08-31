import { useCallback, useState } from 'react'
import type { MediaItem } from '@/hooks/use-tmdb'

const KEY = 'flux-playlists'
export const DEFAULT_PLAYLIST_ID = 'default'

export type PlaylistEntry = MediaItem & { addedAt: number }
export type Playlist = {
  id: string
  name: string
  createdAt: number
  items: PlaylistEntry[]
}

function readAll(): Record<string, Playlist> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, Playlist>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

function notify() {
  try {
    window.dispatchEvent(new Event('flux-playlist-changed'))
  } catch {
    // ignore
  }
}

// Migrate legacy single playlist (flux-playlist) into the default playlist
function migrate() {
  try {
    const legacy = localStorage.getItem('flux-playlist')
    if (!legacy) return
    const all = readAll()
    if (!all[DEFAULT_PLAYLIST_ID]) {
      const entries = JSON.parse(legacy) as Record<string, PlaylistEntry>
      all[DEFAULT_PLAYLIST_ID] = {
        id: DEFAULT_PLAYLIST_ID,
        name: 'Ma playlist',
        createdAt: Date.now(),
        items: Object.values(entries),
      }
      writeAll(all)
    }
    localStorage.removeItem('flux-playlist')
  } catch {
    // ignore
  }
}
if (typeof window !== 'undefined') migrate()

function ensureDefault(): Playlist {
  const all = readAll()
  if (!all[DEFAULT_PLAYLIST_ID]) {
    all[DEFAULT_PLAYLIST_ID] = { id: DEFAULT_PLAYLIST_ID, name: 'Ma playlist', createdAt: Date.now(), items: [] }
    writeAll(all)
  }
  return all[DEFAULT_PLAYLIST_ID]
}

export function getPlaylists(): Playlist[] {
  return Object.values(readAll()).sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0) || (a.id === DEFAULT_PLAYLIST_ID ? -1 : 1)
  )
}

export function getPlaylistById(id: string): Playlist | undefined {
  return readAll()[id]
}

export function createPlaylist(name: string): string {
  const all = readAll()
  const id = `pl-${Date.now().toString(36)}`
  all[id] = { id, name: (name || '').trim() || 'Nouvelle playlist', createdAt: Date.now(), items: [] }
  writeAll(all)
  notify()
  return id
}

export function renamePlaylist(id: string, name: string): void {
  const all = readAll()
  const p = all[id]
  if (!p) return
  p.name = (name || '').trim() || p.name
  writeAll(all)
  notify()
}

export function deletePlaylist(id: string): void {
  if (id === DEFAULT_PLAYLIST_ID) return
  const all = readAll()
  if (!all[id]) return
  delete all[id]
  writeAll(all)
  notify()
}

export function getPlaylistItems(id: string): PlaylistEntry[] {
  const p = readAll()[id]
  return p ? [...p.items].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)) : []
}

export function isInPlaylist(id: string, type: string, tmdbId: number): boolean {
  return readAll()[id]?.items.some(it => it.type === type && it.id === tmdbId) ?? false
}

export function togglePlaylistItem(id: string, item: MediaItem): boolean {
  const all = readAll()
  const p = all[id]
  if (!p) return false
  const idx = p.items.findIndex(it => it.type === item.type && it.id === item.id)
  let added: boolean
  if (idx >= 0) {
    p.items.splice(idx, 1)
    added = false
  } else {
    p.items.push({ ...item, addedAt: Date.now() })
    added = true
  }
  writeAll(all)
  notify()
  return added
}

export function removeFromPlaylist(id: string, type: string, tmdbId: number): void {
  const all = readAll()
  const p = all[id]
  if (!p) return
  p.items = p.items.filter(it => !(it.type === type && it.id === tmdbId))
  writeAll(all)
  notify()
}

// Default-playlist helpers (back-compat for navbar & home)
export function getPlaylist(): PlaylistEntry[] {
  return getPlaylistItems(ensureDefault().id)
}
export function togglePlaylist(item: MediaItem): boolean {
  return togglePlaylistItem(ensureDefault().id, item)
}
export function isInDefaultPlaylist(type: string, tmdbId: number): boolean {
  return isInPlaylist(ensureDefault().id, type, tmdbId)
}

export function usePlaylist(item: MediaItem) {
  const [added, setAdded] = useState(() => isInDefaultPlaylist(item.type, item.id))

  const toggle = useCallback(() => {
    const now = togglePlaylist(item)
    setAdded(now)
    return now
  }, [item])

  return { added, toggle }
}

// Multi-playlist membership for the detail-page menu
export function usePlaylistMenu(item: MediaItem) {
  const load = useCallback(() => {
    const playlists = getPlaylists()
    const memberships: Record<string, boolean> = {}
    for (const p of playlists) memberships[p.id] = isInPlaylist(p.id, item.type, item.id)
    return { playlists, memberships }
  }, [item])

  const [state, setState] = useState(load)

  const refresh = useCallback(() => setState(load()), [load])

  const toggleIn = useCallback((id: string) => {
    togglePlaylistItem(id, item)
    setState(load())
  }, [item, load])

  return { ...state, refresh, toggleIn }
}

// --- Playback queue (sessionStorage) ---
const QUEUE_KEY = 'flux-queue'
export type QueueItem = { type: 'movie' | 'tv'; id: number; title: string }

export function startQueue(items: PlaylistEntry[], shuffle = false): QueueItem | null {
  const order = shuffle ? [...items].sort(() => Math.random() - 0.5) : items
  const queue: QueueItem[] = order.map(it => ({ type: it.type, id: it.id, title: it.title }))
  try {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // ignore
  }
  return queue[0] ?? null
}

export function readQueue(): QueueItem[] {
  try {
    return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || '[]') as QueueItem[]
  } catch {
    return []
  }
}
