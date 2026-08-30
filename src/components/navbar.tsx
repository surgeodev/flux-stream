import { Link, useLocation } from 'wouter'
import { Search, TrendingUp, Film, Tv, Loader2, ListPlus, LayoutGrid } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { withBase } from '@/lib/base-path'
import { searchMedia, imgPath, type MediaItem } from '@/hooks/use-tmdb'
import { getPlaylist } from '@/hooks/use-playlist'
import { useProfile } from '@/hooks/use-profile'
import { AvatarCircle } from '@/components/profile-picker'
import { PosterImage } from '@/components/poster-image'
import { cn } from '@/lib/utils'

export function Navbar() {
  const [, setLocation] = useLocation()
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<MediaItem[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [playlistCount, setPlaylistCount] = useState(0)
  const { profile } = useProfile()
  const boxRef = useRef<HTMLDivElement>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    const update = () => setPlaylistCount(getPlaylist().length)
    update()
    window.addEventListener('flux-playlist-changed', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('flux-playlist-changed', update)
      window.removeEventListener('storage', update)
    }
  }, [])

  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSuggestions([])
      setSearching(false)
      return
    }
    setSearching(true)
    const seq = ++seqRef.current
    const t = setTimeout(() => {
      searchMedia(q)
        .then(res => {
          if (seq !== seqRef.current) return
          setSuggestions(res.slice(0, 6))
          setOpen(true)
        })
        .catch(() => { if (seq === seqRef.current) setSuggestions([]) })
        .finally(() => { if (seq === seqRef.current) setSearching(false) })
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      setOpen(false)
      setLocation(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  const goTo = (item: MediaItem) => {
    setOpen(false)
    setSearchQuery('')
    setSuggestions([])
    setLocation(item.type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-background/85 backdrop-blur-xl"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}>
      <div className="container mx-auto px-3 md:px-6 py-2 md:py-3 flex items-center justify-between gap-2 md:gap-4">
        <Link href="/" className="flex items-center gap-2 z-10 shrink-0">
          <img src={withBase('/logo.png')} alt="FLUX" width={120} height={28} className="h-6 md:h-7 w-auto" />
        </Link>

        <Link href="/categories"
          className="relative z-10 flex items-center gap-1.5 rounded-full px-2.5 md:px-3.5 py-1.5 md:py-2 text-xs md:text-sm font-medium text-white/60 transition-colors hover:text-white hover:bg-white/[0.06]">
          <LayoutGrid className="w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={1.75} />
          <span className="hidden md:inline">Catégories</span>
        </Link>

        <Link href="/playlist"
          className={cn('relative z-10 flex items-center gap-1.5 rounded-full px-2.5 md:px-3.5 py-1.5 md:py-2 text-xs md:text-sm font-medium text-white/60 transition-colors hover:text-white hover:bg-white/[0.06]',
            playlistCount > 0 && 'text-primary/90')}>
          <ListPlus className="w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={1.75} />
          <span className="hidden md:inline">Playlist</span>
          {playlistCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 min-w-[18px] px-0.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-primary/40">
              {playlistCount}
            </span>
          )}
        </Link>

        <Link
          href="/account"
          title={profile?.name ? `Profil : ${profile.name}` : 'Créer ton profil'}
          className="relative z-10 flex items-center justify-center gap-2 rounded-full p-1 md:pl-1 md:pr-3 hover:bg-white/[0.06] transition-colors shrink-0"
        >
          <AvatarCircle name={profile?.name} avatar={profile?.avatar} />
          <span className="hidden md:inline text-xs font-medium text-white/60 max-w-[80px] truncate">
            {profile?.name || 'Profil'}
          </span>
        </Link>

        <div ref={boxRef} className="flex-1 max-w-xl relative">
          <form onSubmit={handleSearch} className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Rechercher un film ou une série..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setOpen(true) }}
              onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
              className="w-full bg-white/[0.04] border border-transparent rounded-full py-1.5 md:py-2 pl-9 pr-9 text-xs md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 focus:bg-white/[0.07] transition-all"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
            )}
          </form>

          {open && searchQuery.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {suggestions.length > 0 ? (
                <>
                  {suggestions.map(item => (
                    <button key={`${item.type}-${item.id}`} onClick={() => goTo(item)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                      <span className="w-9 h-[52px] rounded-md overflow-hidden bg-white/5 flex-shrink-0">
                        <PosterImage src={imgPath(item.img, 'w92')} alt="" placeholder={item.title} className="w-full h-full" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-white truncate">{item.title}</span>
                        <span className="block text-[11px] text-white/40 mt-0.5 flex items-center gap-1">
                          {item.type === 'tv' ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                          {item.type === 'tv' ? 'Série' : 'Film'}
                          {item.year > 0 && <><span className="w-1 h-1 rounded-full bg-white/30" />{item.year}</>}
                          {item.rating ? <><span className="w-1 h-1 rounded-full bg-white/30" />★ {item.rating.toFixed(1)}</> : null}
                        </span>
                      </span>
                      <Search className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
                    </button>
                  ))}
                  <button onClick={handleSearch}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-primary font-medium hover:bg-white/5 transition-colors">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Voir tous les résultats pour &ldquo;{searchQuery.trim()}&rdquo;
                  </button>
                </>
              ) : (
                <div className="px-4 py-5 text-center text-sm text-white/40">
                  {searching ? 'Recherche en cours…' : `Aucun résultat pour “${searchQuery.trim()}”`}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
