import { useEffect, useRef, useState } from 'react'
import { Plus, Check, ChevronDown, ListPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlaylist, usePlaylistMenu, createPlaylist } from '@/hooks/use-playlist'
import { useToast } from '@/components/ui/use-toast'
import type { MediaItem } from '@/hooks/use-tmdb'

export function PlaylistButton({ item, className }: { item: MediaItem; className?: string }) {
  const { added, toggle } = usePlaylist(item)
  const { playlists, memberships, toggleIn } = usePlaylistMenu(item)
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleNew = () => {
    const name = window.prompt('Nom de la nouvelle playlist', 'Ma playlist')
    if (name === null) return
    toggleIn(createPlaylist(name))
    toast({ title: 'Playlist créée', description: `« ${name} » · ${item.title}`, variant: 'success' })
  }

  const handleToggle = () => {
    if (added) {
      toast({ title: 'Retiré de la playlist', description: item.title, variant: 'default' })
    } else {
      toast({ title: 'Ajouté à la playlist', description: item.title, variant: 'success' })
    }
    toggle()
  }

  const handleToggleIn = (playlistId: string) => {
    const playlist = playlists.find(p => p.id === playlistId)
    const willAdd = !memberships[playlistId]
    toggleIn(playlistId)
    toast({
      title: willAdd ? 'Ajouté à la playlist' : 'Retiré de la playlist',
      description: `${item.title} · ${playlist?.name ?? ''}`,
      variant: willAdd ? 'success' : 'default',
    })
  }

  const shared = added
    ? 'bg-primary/20 text-primary border-primary/40 shadow-[0_0_25px_hsl(var(--primary)/0.35)]'
    : 'bg-white/10 hover:bg-white/20 text-white border-white/15'

  return (
    <div ref={boxRef} className={cn('relative inline-flex', className)}>
      <button
        onClick={handleToggle}
        title={added ? 'Retirer de ma playlist' : 'Ajouter à ma playlist'}
        className={cn(
          'inline-flex items-center gap-2 md:gap-2.5 px-6 md:px-8 py-2.5 md:py-3.5 rounded-l-xl rounded-r-none font-semibold backdrop-blur transition-all hover:scale-105 active:scale-95 border text-sm md:text-base',
          shared
        )}
      >
        {added ? <Check className="w-4 h-4 md:w-5 md:h-5" /> : <Plus className="w-4 h-4 md:w-5 md:h-5" />}
        <span className="hidden sm:inline">{added ? 'Dans ma playlist' : 'Ma playlist'}</span>
        <span className="sm:hidden">{added ? 'Ajouté' : 'Ajouter'}</span>
      </button>
      <button
        onClick={() => setOpen(o => !o)}
        title="Choisir la playlist"
        className={cn(
          'flex items-center justify-center w-10 md:w-12 py-2.5 md:py-3.5 rounded-r-xl font-semibold backdrop-blur transition-all hover:scale-105 active:scale-95 border border-l-0 text-sm md:text-base',
          shared
        )}
      >
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 w-64 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-right">
          <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">Ajouter à</p>
          <div className="p-1.5 max-h-64 overflow-y-auto">
            {playlists.map(p => (
              <button key={p.id} onClick={() => handleToggleIn(p.id)}
                className={cn(
                  'flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-colors',
                  memberships[p.id] ? 'text-primary' : 'text-white/80 hover:bg-white/[0.06]'
                )}>
                <span className={cn('w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                  memberships[p.id] ? 'bg-primary border-primary' : 'border-white/25')}>
                  {memberships[p.id] && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-[10px] text-white/30">{p.items.length}</span>
              </button>
            ))}
            <button onClick={handleNew}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-left text-sm font-semibold text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors border-t border-white/10 mt-1">
              <ListPlus className="w-4 h-4" />
              Nouvelle playlist
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
