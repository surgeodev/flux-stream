import { Layout } from '@/components/layout'
import { Link, useLocation } from 'wouter'
import { ListPlus, Play, X, Star, Plus, Pencil, Trash2, Shuffle } from 'lucide-react'
import {
  getPlaylists, getPlaylistItems, createPlaylist, renamePlaylist, deletePlaylist,
  removeFromPlaylist, startQueue, DEFAULT_PLAYLIST_ID, type PlaylistEntry,
} from '@/hooks/use-playlist'
import { imgPath } from '@/hooks/use-tmdb'
import { PosterImage } from '@/components/poster-image'
import { cn } from '@/lib/utils'
import { useState, useEffect, useCallback } from 'react'

function Poster({ item }: { item: PlaylistEntry }) {
  return (
    <PosterImage src={imgPath(item.img)} alt={item.title} placeholder={item.title} className="absolute inset-0" imgClassName="transition-transform duration-500 group-hover:scale-110" />
  )
}

const ACTIVE_KEY = 'flux-active-playlist'

export default function PlaylistPage() {
  const [, setLocation] = useLocation()
  const [playlists, setPlaylists] = useState(getPlaylists)
  const [activeId, setActiveId] = useState<string>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_KEY) : null
    return saved && getPlaylists().some(p => p.id === saved) ? saved : (getPlaylists()[0]?.id ?? DEFAULT_PLAYLIST_ID)
  })
  const [items, setItems] = useState<PlaylistEntry[]>(() => getPlaylistItems(activeId))

  const refresh = useCallback(() => {
    setPlaylists(getPlaylists())
    setItems(getPlaylistItems(activeId))
  }, [activeId])

  const select = useCallback((id: string) => {
    setActiveId(id)
    try { localStorage.setItem(ACTIVE_KEY, id) } catch {}
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('flux-playlist-changed', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('flux-playlist-changed', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [refresh])

  const active = playlists.find(p => p.id === activeId) ?? playlists[0]

  const handleCreate = () => {
    const name = window.prompt('Nom de la nouvelle playlist', 'Ma playlist')
    if (name === null) return
    select(createPlaylist(name))
  }

  const handleRename = () => {
    if (!active) return
    const name = window.prompt('Renommer la playlist', active.name)
    if (name === null) return
    renamePlaylist(active.id, name)
  }

  const handleDelete = () => {
    if (!active || active.id === DEFAULT_PLAYLIST_ID) return
    if (!window.confirm(`Supprimer la playlist « ${active.name} » ?`)) return
    deletePlaylist(active.id)
    const rest = getPlaylists()
    select(rest[0]?.id ?? DEFAULT_PLAYLIST_ID)
  }

  const play = (shuffle: boolean) => {
    const first = startQueue(getPlaylistItems(activeId), shuffle)
    if (first) setLocation(`/watch?q=1&type=${first.type}&id=${first.id}&title=${encodeURIComponent(first.title)}`)
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-6 pt-24 md:pt-32 pb-16">
        <div className="flex items-center gap-3 mb-6">
          <span className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-white shadow-[0_4px_20px_hsl(var(--primary)/0.4)]">
            <ListPlus className="w-5 h-5 md:w-6 md:h-6" />
          </span>
          <div>
            <h1 className="text-2xl md:text-4xl font-black font-display text-white">Mes playlists</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
              {playlists.length > 0 ? `${playlists.length} playlist${playlists.length > 1 ? 's' : ''} · lisez-les dans l'ordre` : 'Vos films et séries à regarder plus tard'}
            </p>
          </div>
        </div>

        {/* ===== Playlist selector ===== */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
          {playlists.map(p => (
            <button key={p.id} onClick={() => select(p.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap border transition-all',
                p.id === activeId
                  ? 'bg-primary/90 text-white border-primary shadow-lg shadow-primary/20'
                  : 'bg-white/[0.04] text-white/55 border-white/10 hover:bg-white/[0.09] hover:text-white'
              )}>
              {p.name}
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', p.id === activeId ? 'bg-black/30' : 'bg-white/10')}>{p.items.length}</span>
            </button>
          ))}
          <button onClick={handleCreate}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold bg-white/[0.04] border border-dashed border-white/20 text-white/50 hover:text-white hover:border-white/40 whitespace-nowrap transition-all">
            <Plus className="w-4 h-4" /> Nouvelle
          </button>
        </div>

        {/* ===== Active playlist header ===== */}
        {active && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <h2 className="text-lg md:text-2xl font-bold font-display text-white flex items-center gap-2">
              {active.name}
              <span className="text-xs font-semibold text-muted-foreground">{items.length} titre{items.length > 1 ? 's' : ''}</span>
            </h2>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => play(false)} disabled={items.length === 0}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:scale-[1.03] active:scale-95 shadow-[0_0_20px_hsl(var(--primary)/0.3)]">
                <Play className="w-4 h-4 fill-current" /> Lire tout
              </button>
              <button onClick={() => play(true)} disabled={items.length === 0}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:pointer-events-none text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:scale-[1.03] active:scale-95">
                <Shuffle className="w-4 h-4" /> Mélanger
              </button>
              <button onClick={handleRename} title="Renommer"
                className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.09] flex items-center justify-center text-white/60 hover:text-white transition-all">
                <Pencil className="w-4 h-4" />
              </button>
              {active.id !== DEFAULT_PLAYLIST_ID && (
                <button onClick={handleDelete} title="Supprimer la playlist"
                  className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-red-500/20 hover:border-red-500/40 flex items-center justify-center text-white/60 hover:text-red-400 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-20 h-20 rounded-full bg-card border border-white/10 flex items-center justify-center mb-5">
              <ListPlus className="w-9 h-9 text-white/30" />
            </div>
            <h2 className="text-xl font-bold font-display text-white mb-2">Playlist vide</h2>
            <p className="text-sm text-muted-foreground max-w-sm mb-7">
              Ajoutez des films et séries avec le bouton « Ma playlist » sur une fiche, ou via le menu « + ».
            </p>
            <Link href="/" className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-7 py-3 rounded-xl font-bold transition-all hover:scale-105 shadow-[0_0_25px_hsl(var(--primary)/0.4)]">
              <Play className="w-4 h-4 fill-current" /> Découvrir le catalogue
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4 mt-6">
            {items.map(item => (
              <div key={`${item.type}-${item.id}`} className="group relative">
                <Link
                  href={item.type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`}
                  className="block relative aspect-[2/3] rounded-xl overflow-hidden bg-card border border-white/5 transition-all duration-300 group-hover:scale-[1.04] group-hover:shadow-2xl group-hover:shadow-black/60"
                >
                  <Poster item={item} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                    <div className="flex items-center gap-2 w-full">
                      <span className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-lg shrink-0">
                        <Play className="w-4 h-4 ml-0.5 fill-current" />
                      </span>
                      {item.rating ? (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-yellow-400">
                          <Star className="w-3 h-3 fill-current" />{item.rating.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>

                <button
                  onClick={() => { removeFromPlaylist(activeId, item.type, item.id); refresh() }}
                  title="Retirer de la playlist"
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-primary text-white/80 hover:text-white backdrop-blur flex items-center justify-center transition-all hover:scale-110 shadow-lg"
                >
                  <X className="w-4 h-4" />
                </button>

                <h3 className="text-xs md:text-sm font-semibold mt-2 line-clamp-1 leading-tight" title={item.title}>{item.title}</h3>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">{item.type === 'tv' ? 'Série' : 'Film'}{item.year > 0 ? ` · ${item.year}` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
