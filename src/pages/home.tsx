import { Layout } from '@/components/layout'
import { Link } from 'wouter'
import { Play, Info, Star, ChevronRight, ChevronLeft, Sparkles, Clapperboard, Tv, Clock, Heart, ListPlus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, useScroll, useSpring, useTransform } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MediaRow, MediaRowSkeleton } from '@/components/media-row'
import { getTrending, getCatalog, getRecentMovies, getTopRated, getGenreSection, bgPath, HOME_GENRES, type MediaItem } from '@/hooks/use-tmdb'
import { getAllProgress, getAllProgressWithKeys, formatWatchTime, type WatchProgress } from '@/hooks/use-watch-progress'
import { getPlaylist } from '@/hooks/use-playlist'
import { useProfile } from '@/hooks/use-profile'

const ROW_TINTS = [
  { hue: 348, label: 'Flammes' },
  { hue: 210, label: 'Nébuleuse' },
  { hue: 165, label: 'Océan' },
  { hue: 130, label: 'Émeraude' },
  { hue: 35, label: 'Ambre' },
  { hue: 320, label: 'Rose' },
  { hue: 190, label: 'Turquoise' },
  { hue: 45, label: 'Or' },
]

const heroFadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } },
}

function HeroCarousel({ items }: { items: MediaItem[] }) {
  const [current, setCurrent] = useState(0)
  const [touchStart, setTouchStart] = useState(0)

  // Parallax via motion values -> aucun re-render React au scroll
  const { scrollY } = useScroll()
  const smoothScroll = useSpring(scrollY, { stiffness: 90, damping: 25, mass: 0.4 })
  const bgY = useTransform(smoothScroll, [0, 500], [0, 140])
  const contentY = useTransform(smoothScroll, [0, 500], [0, 40])
  const contentOpacity = useTransform(smoothScroll, [0, 420], [1, 0])

  const goTo = useCallback((idx: number) => {
    if (idx === current) return
    setCurrent(idx)
  }, [current])

  const prev = () => goTo((current - 1 + items.length) % items.length)
  const next = useCallback(() => goTo((current + 1) % items.length), [current, items.length, goTo])

  useEffect(() => {
    if (items.length <= 1) return
    const t = setInterval(next, 9000)
    return () => clearInterval(t)
  }, [next, items.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prev, next])

  const onTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX)
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStart
    if (Math.abs(dx) > 50) dx > 0 ? prev() : next()
  }

  if (!items.length) return <Skeleton className="w-full h-[62vh] md:h-[85vh] rounded-none" />

  const item = items[current]

  return (
    <section
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="relative w-full h-[62vh] md:h-[85vh] overflow-hidden bg-black select-none"
    >
      {/* ===== Fond : backdrop + parallax ===== */}
      <motion.div className="absolute inset-0" style={{ y: bgY }}>
        <AnimatePresence initial={false}>
          <motion.div key={current} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeInOut' }} className="absolute inset-0">
            <img src={bgPath(item.backdrop || '')} alt={item.title} className="w-full h-full object-cover kenburns-static" />
          </motion.div>
        </AnimatePresence>

        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/45 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />

        {/* Halo rouge signature — désactivé sur mobile (blur GPU énorme), atténué sur desktop */}
        <div className="pointer-events-none absolute -top-1/4 -left-[15%] w-[70%] h-[90%] rounded-full blur-[130px] opacity-25 bg-primary max-md:hidden md:opacity-15" />
        <div className="pointer-events-none absolute -bottom-1/3 right-[-10%] w-[55%] h-[60%] rounded-full blur-[140px] opacity-[0.12] bg-white/10 max-md:hidden md:opacity-[0.08]" />

        <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-background to-transparent" />
      </motion.div>

      {/* ===== Liseré + fondu haut cinéma ===== */}
      <div className="absolute top-0 left-0 right-0 z-30 h-[3px] bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none" />

      {/* ===== Contenu ===== */}
      <motion.div className="absolute inset-0 z-20 flex items-end md:items-center"
        style={{ y: contentY, opacity: contentOpacity }}>
        <div className="container mx-auto px-4 md:px-12 pb-20 md:pb-10">
          <motion.div
            key={`content-${current}`}
            variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } } }}
            initial="hidden"
            animate="show"
            className="max-w-2xl flex flex-col gap-3 md:gap-5"
          >
            <motion.div variants={heroFadeUp} className="flex items-center gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.35em] text-white/70">
                À l'affiche
              </span>
            </motion.div>

            <motion.h1 variants={heroFadeUp}
              className="hero-shimmer-text text-4xl md:text-6xl lg:text-7xl font-black font-display leading-[1.04] drop-shadow-[0_8px_40px_rgba(0,0,0,0.9)] line-clamp-2 tracking-tight">
              {item.title}
            </motion.h1>

            <motion.div variants={heroFadeUp} className="flex items-center gap-x-3 gap-y-2 text-xs md:text-sm font-medium flex-wrap text-white/60">
              {(item.rating ?? 0) > 0 && (
                <span className="flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                  <span className="text-white font-bold">{(item.rating ?? 0).toFixed(1)}</span>
                  <span className="text-white/40">/10</span>
                </span>
              )}
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span className="uppercase tracking-[0.2em] text-[10px] md:text-[11px] text-white/70">
                {item.type === 'tv' ? 'Série' : 'Film'}
              </span>
              {item.year > 0 && (
                <>
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                  <span>{item.year}</span>
                </>
              )}
              {item.seasons ? (
                <>
                  <span className="w-1 h-1 rounded-full bg-white/30" />
                  <span>{item.seasons} saisons</span>
                </>
              ) : null}
            </motion.div>

            {item.overview && (
              <motion.p variants={heroFadeUp} className="text-xs md:text-base text-white/65 line-clamp-2 md:line-clamp-3 max-w-xl leading-relaxed">
                {item.overview}
              </motion.p>
            )}

            <motion.div variants={heroFadeUp} className="flex items-center gap-3 md:gap-4 mt-1 md:mt-3 flex-wrap">
              <Link
                href={`/watch?type=${item.type}&id=${item.id}&title=${encodeURIComponent(item.title)}`}
                className="relative overflow-hidden inline-flex items-center gap-2 md:gap-3 bg-primary hover:bg-primary/85 text-white px-6 md:px-8 py-2.5 md:py-3.5 rounded-lg font-bold transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_35px_hsl(var(--primary)/0.35)] text-sm md:text-base"
              >
                <Play className="w-4 h-4 md:w-5 md:h-5 fill-current" />Regarder
              </Link>
              <Link
                href={item.type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`}
                className="inline-flex items-center gap-2 md:gap-3 bg-white/5 hover:bg-white/10 text-white/85 hover:text-white px-6 md:px-8 py-2.5 md:py-3.5 rounded-lg font-semibold backdrop-blur transition-all border border-white/15 text-sm md:text-base"
              >
                <Info className="w-4 h-4 md:w-5 md:h-5" />Plus d'infos
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* ===== Flèches desktop ===== */}
      {items.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Précédent"
            className="absolute left-3 lg:left-6 top-1/2 -translate-y-1/2 z-30 hidden md:flex w-11 h-11 items-center justify-center rounded-full bg-black/40 backdrop-blur border border-white/10 text-white/70 hover:text-white hover:bg-primary/80 hover:border-primary/40 transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            aria-label="Suivant"
            className="absolute right-3 lg:right-6 top-1/2 -translate-y-1/2 z-30 hidden md:flex w-11 h-11 items-center justify-center rounded-full bg-black/40 backdrop-blur border border-white/10 text-white/70 hover:text-white hover:bg-primary/80 hover:border-primary/40 transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* ===== Navigation : points + compteur ===== */}
      {items.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 z-30">
          <div className="container mx-auto px-4 md:px-12 pb-5 md:pb-7 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {items.map((_, i) => (
                <button key={i} onClick={() => goTo(i)} aria-label={`Slide ${i + 1}`}
                  className={cn('rounded-full transition-all duration-300',
                    i === current
                      ? 'w-6 h-1.5 bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.7)]'
                      : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/60')} />
              ))}
            </div>
            <div className="flex items-baseline gap-1 font-display select-none pointer-events-none">
              <span className="text-xl md:text-2xl font-extrabold leading-none text-white">{String(current + 1).padStart(2, '0')}</span>
              <span className="text-xs text-white/40 font-semibold">/ {String(items.length).padStart(2, '0')}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ContinueWatching() {
  const [entries, setEntries] = useState<{ key: string; p: WatchProgress }[]>([])
  useEffect(() => {
    const load = () => setEntries(getAllProgressWithKeys())
    load()
    window.addEventListener('storage', load)
    window.addEventListener('flux-progress-changed', load)
    return () => {
      window.removeEventListener('storage', load)
      window.removeEventListener('flux-progress-changed', load)
    }
  }, [])

  if (entries.length === 0) return null

  const items: MediaItem[] = entries.map(e => ({
    id: e.p.id, type: e.p.type, title: e.p.title, img: e.p.img || '', rating: 0, year: 0, overview: '', backdrop: '',
  }))
  const labels = entries.map(e => `Reprendre · ${formatWatchTime(e.p.t)}`)
  const progress = entries.map(e => Math.min(1, e.p.t / e.p.dur))
  const hrefs = entries.map(e => {
    const base = `/watch?type=${e.p.type}&id=${e.p.id}&title=${encodeURIComponent(e.p.title)}&resume=1`
    if (e.p.type === 'tv') {
      const m = e.key.match(/s(\d+)e(\d+)/i)
      return m ? `${base}&s=${m[1]}&e=${m[2]}` : base
    }
    return base
  })

  return (
    <MediaRow
      title="Continuer à regarder"
      items={items}
      progressLabels={labels}
      progressValues={progress}
      hrefs={hrefs}
      tint={ROW_TINTS[0]}
      icon={<Clock className="w-5 h-5" />}
      subtitle="Reprends ta série où tu t'es arrêté"
    />
  )
}

function MyPlaylistRow() {
  const [items, setItems] = useState<MediaItem[]>([])
  useEffect(() => {
    const load = () => {
      const list = getPlaylist()
      setItems(list.slice(0, 18))
    }
    load()
    window.addEventListener('flux-playlist-changed', load)
    window.addEventListener('storage', load)
    return () => {
      window.removeEventListener('flux-playlist-changed', load)
      window.removeEventListener('storage', load)
    }
  }, [])

  if (items.length === 0) return null
  return <MediaRow title="Ma playlist" items={items} tint={ROW_TINTS[1]} icon={<ListPlus className="w-5 h-5" />} subtitle="À regarder plus tard" />
}

function MyLikesRow() {
  const { profile } = useProfile()
  const [likes, setLikes] = useState<MediaItem[]>([])

  useEffect(() => {
    const load = () => {
      const list = profile?.likes || []
      setLikes(list.map(l => ({ id: l.id, type: l.type, title: l.title, img: l.img || '', rating: 0, year: 0, overview: '', backdrop: '' })))
    }
    load()
    window.addEventListener('flux-likes-changed', load)
    window.addEventListener('flux-profile-changed', load)
    return () => {
      window.removeEventListener('flux-likes-changed', load)
      window.removeEventListener('flux-profile-changed', load)
    }
  }, [profile])

  if (likes.length === 0 || !profile?.name) return null
  return <MediaRow title="Mes favoris" items={likes} tint={ROW_TINTS[2]} icon={<Heart className="w-5 h-5" />} subtitle="Tout ce que tu as aimé" />
}

export default function Home() {
  const [trending, setTrending] = useState<MediaItem[]>([])
  const [movies, setMovies] = useState<MediaItem[]>([])
  const [tvShows, setTVShows] = useState<MediaItem[]>([])
  const [recent, setRecent] = useState<MediaItem[]>([])
  const [topRated, setTopRated] = useState<MediaItem[]>([])
  const [byGenre, setByGenre] = useState<Record<string, MediaItem[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    Promise.allSettled([
      getTrending(),
      getCatalog(),
      getRecentMovies(),
      getTopRated(),
      ...HOME_GENRES.slice(0, 6).map(g => getGenreSection(g.label, g.movies, g.tv, g.sort)),
    ]).then(results => {
      if (cancelled) return
      const [tr, cat, rec, top, ...genres] = results
      if (tr.status === 'fulfilled') setTrending(tr.value)
      if (cat.status === 'fulfilled') {
        const items = cat.value
        setMovies(items.filter(m => m.type === 'movie'))
        setTVShows(items.filter(t => t.type === 'tv'))
      }
      if (rec.status === 'fulfilled') setRecent(rec.value)
      if (top.status === 'fulfilled') setTopRated(top.value)
      const genreMap: Record<string, MediaItem[]> = {}
      HOME_GENRES.slice(0, 6).forEach((g, i) => {
        const r = genres[i]
        if (r.status === 'fulfilled') genreMap[g.label] = r.value
      })
      setByGenre(genreMap)
      setLoading(false)
    })

    // Sections genres restantes en arrière-plan (défauts : pas bloquant)
    HOME_GENRES.slice(6).forEach(g => {
      getGenreSection(g.label, g.movies, g.tv, g.sort)
        .then(items => { if (!cancelled) setByGenre(prev => ({ ...prev, [g.label]: items })) })
        .catch(() => undefined)
    })

    return () => { cancelled = true }
  }, [])

  const heroItems = useMemo(() => trending.filter(m => m.backdrop || m.img), [trending])

  // --- Dédup globale : chaque titre n'apparaît qu'une seule fois sur la page ---
  const rows = useMemo(() => {
    const used = new Set<string>()
    const mark = (list: MediaItem[]) => list.forEach(i => used.add(`${i.type}-${i.id}`))
    const fresh = (list: MediaItem[]) => list.filter(i => !used.has(`${i.type}-${i.id}`))
    const take = (list: MediaItem[], n: number) => {
      const f = fresh(list)
      mark(f.slice(0, n))
      return f.slice(0, n)
    }

    mark(heroItems)
    const contWatching = fresh(getAllProgress().map(p => ({ id: p.id, type: p.type, title: p.title, img: p.img || '', rating: 0, year: 0, overview: '', backdrop: '' } as MediaItem)))
    mark(contWatching)

    const top10 = take(topRated, 10)
    const popMovies = take(movies, 16)
    const popTV = take(tvShows, 16)
    const nouveautes = take(recent, 14)

    const genreSections: { label: string; items: MediaItem[] }[] = []
    HOME_GENRES.forEach((g, i) => {
      const items = byGenre[g.label]
      if (!items || items.length === 0) return
      const f = take(items, 16)
      if (f.length > 0) genreSections.push({ label: g.label, items: f })
    })

    return { contWatching, top10, popMovies, popTV, nouveautes, genreSections }
  }, [heroItems, topRated, movies, tvShows, recent, byGenre])

  return (
    <Layout>
      {loading ? (
        <>
          <Skeleton className="w-full h-[62vh] md:h-[85vh] rounded-none" />
          <MediaRowSkeleton />
          <MediaRowSkeleton />
        </>
      ) : (
        <>
          <HeroCarousel items={heroItems} />

          {rows.contWatching.length > 0 && (
            <ContinueWatching />
          )}

          <MyPlaylistRow />

          <MyLikesRow />

          {rows.top10.length > 0 && (
            <div className="pt-2 md:pt-6">
              <MediaRow title="Top 10 cette semaine" items={rows.top10} rank tint={ROW_TINTS[7]} icon={<Sparkles className="w-5 h-5" />} subtitle="Les mieux notés du moment" />
            </div>
          )}

          <MediaRow title="Films populaires" items={rows.popMovies} tint={ROW_TINTS[1]} icon={<Clapperboard className="w-5 h-5" />} subtitle="Les plus regardés sur Flux" />

          <MediaRow title="Séries populaires" items={rows.popTV} tint={ROW_TINTS[2]} icon={<Tv className="w-5 h-5" />} subtitle="Les séries qui buzzent en ce moment" />

          {rows.nouveautes.length > 0 && (
            <MediaRow title="Nouveautés au cinéma" items={rows.nouveautes} tint={ROW_TINTS[3]} icon={<Sparkles className="w-5 h-5" />} subtitle="Fraîchement sortis" />
          )}

          {rows.genreSections.map((s, i) => {
            const g = HOME_GENRES.find(x => x.label === s.label)!
            const tint = ROW_TINTS[(i + 4) % ROW_TINTS.length]
            return (
              <MediaRow key={s.label} title={`${s.label} à la une`} items={s.items} tint={tint} icon={<Heart className="w-5 h-5" />} subtitle={`Notre sélection ${s.label.toLowerCase()}`} />
            )
          })}

          {/* État vide global : si aucune section n'a d'items */}
          {rows.contWatching.length === 0 && rows.top10.length === 0 && rows.popMovies.length === 0 && rows.popTV.length === 0 && rows.nouveautes.length === 0 && rows.genreSections.length === 0 && (
            <div className="container mx-auto px-4 py-16 text-center">
              <div className="inline-flex flex-col items-center gap-4 bg-card/50 backdrop-blur rounded-2xl border border-white/10 p-10 max-w-md mx-auto">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <Clapperboard className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-foreground">Aucun contenu trouvé</h3>
                  <p className="text-sm text-muted-foreground mt-2">Impossible de charger les films et séries. Vérifiez votre connexion ou réessayez plus tard.</p>
                </div>
                <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/80 transition-colors">
                  Réessayer
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
