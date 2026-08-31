import { Layout } from '@/components/layout'
import { Link } from 'wouter'
import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Loader2, ChevronLeft, Clapperboard, Tv, Film } from 'lucide-react'
import { MediaCard } from '@/components/media-card'
import { CATEGORIES, getCategoryGrid, type CategoryDef, type MediaItem } from '@/hooks/use-tmdb'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'movie' | 'tv'

function CategoryHeader({ cat }: { cat: CategoryDef }) {
  const hue = cat.hue
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 mb-8">
      <div className="absolute inset-0"
        style={{ background: `linear-gradient(140deg, hsl(${hue} 55% 16%), hsl(${(hue + 60) % 360} 50% 12%) 50%, hsl(${(hue + 110) % 360} 45% 10%))` }} />
      <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full opacity-30 blur-[90px]"
        style={{ background: `hsl(${hue} 90% 55%)` }} />
      <div className="absolute -bottom-28 -left-16 w-64 h-64 rounded-full opacity-25 blur-[80px]"
        style={{ background: `hsl(${(hue + 140) % 360} 90% 50%)` }} />
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="relative px-6 md:px-10 py-10 md:py-14">
        <Link href="/categories" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors mb-4">
          <ChevronLeft className="w-3.5 h-3.5" />
          Toutes les catégories
        </Link>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_hsl(var(--primary))]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">FLUX</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black font-display tracking-tight drop-shadow-[0_4px_30px_rgba(0,0,0,0.6)]">
          {cat.label}
        </h1>
        <p className="text-sm md:text-base text-white/60 mt-2">{cat.tagline}</p>
      </div>
    </div>
  )
}

export default function CategoryPage({ params }: { params?: { id?: string } }) {
  const label = params?.id ?? ''
  const cat = useMemo(() => CATEGORIES.find(c => c.label.toLowerCase() === decodeURIComponent(label).toLowerCase()), [label])

  const [items, setItems] = useState<MediaItem[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!cat) return
    setItems([])
    setPage(1)
    setLoading(true)
    setFilter('all')
    setQuery('')
    getCategoryGrid(cat, 1).then(list => {
      setItems(list)
      setHasMore(list.length >= 16)
      setLoading(false)
    })
  }, [cat])

  const loadMore = () => {
    if (!cat || loadingMore) return
    setLoadingMore(true)
    getCategoryGrid(cat, page + 1).then(list => {
      setItems(prev => {
        const seen = new Set(prev.map(i => `${i.type}-${i.id}`))
        const fresh = list.filter(i => !seen.has(`${i.type}-${i.id}`))
        return [...prev, ...fresh]
      })
      setHasMore(list.length >= 16)
      setPage(p => p + 1)
      setLoadingMore(false)
    })
  }

  const filtered = useMemo(() => {
    let list = items
    if (filter === 'movie') list = list.filter(i => i.type === 'movie')
    if (filter === 'tv') list = list.filter(i => i.type === 'tv')
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(i => i.title.toLowerCase().includes(q))
    }
    return list
  }, [items, filter, query])

  const hasTv = Boolean(cat?.tv)

  if (!cat) {
    return (
      <Layout>
        <div className="container mx-auto px-4 md:px-6 pt-32 pb-16 text-center">
          <h1 className="text-3xl font-bold font-display">Catégorie introuvable</h1>
          <Link href="/categories" className="inline-flex items-center gap-2 text-primary mt-4">
            <ChevronLeft className="w-4 h-4" /> Retour aux catégories
          </Link>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-6 pt-24 md:pt-32 pb-16">
        <CategoryHeader cat={cat} />

        {/* ===== Barre de filtres ===== */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            {[
              { id: 'all' as Filter, label: 'Tout', icon: <Clapperboard className="w-4 h-4" /> },
              { id: 'movie' as Filter, label: 'Films', icon: <Film className="w-4 h-4" /> },
              ...(hasTv ? [{ id: 'tv' as Filter, label: 'Séries', icon: <Tv className="w-4 h-4" /> }] : []),
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all border',
                  filter === f.id
                    ? 'bg-primary text-white border-primary shadow-[0_0_20px_hsl(var(--primary)/0.4)]'
                    : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:bg-white/10'
                )}
              >
                {f.icon}
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {filtered.length} titre{filtered.length > 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
              {filtered.map((item, i) => (
                <motion.div
                  key={`${item.type}-${item.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.6), ease: 'easeOut' }}
                >
                  <MediaCard item={item} />
                </motion.div>
              ))}
            </div>
            {hasMore && filter === 'all' && !query && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/15 text-white font-semibold px-8 py-3 rounded-full transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}
                  Charger plus
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Clapperboard className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold font-display">Aucun titre trouvé</h3>
            <p className="text-muted-foreground mt-1">Essayez un autre filtre ou rechargez la page.</p>
          </div>
        )}
      </div>
    </Layout>
  )
}
