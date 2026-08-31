import { Layout } from '@/components/layout'
import { Link } from 'wouter'
import { motion } from 'framer-motion'
import { Sparkles, Zap, Rocket, Laugh, Theater, Skull, Palette, Eye, Heart, Compass, Wand2, Puzzle, Camera, Swords, Trees, Music2, ShieldAlert, Baby, ScrollText, ChevronRight, Clapperboard, Tv, Film, Search } from 'lucide-react'
import { CATEGORIES, type CategoryDef } from '@/hooks/use-tmdb'

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Action: Zap,
  'Science-fiction': Rocket,
  Comédie: Laugh,
  Drame: Theater,
  Horreur: Skull,
  Animation: Palette,
  Thriller: Eye,
  Romance: Heart,
  Aventure: Compass,
  Fantastique: Wand2,
  Mystère: Puzzle,
  Documentaire: Camera,
  Guerre: Swords,
  Western: Trees,
  Musique: Music2,
  Crime: ShieldAlert,
  Famille: Baby,
  Histoire: ScrollText,
}

function TypeBadge({ hasMovies, hasTv }: { hasMovies: boolean; hasTv: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border px-2 py-0.5"
      style={hasTv
        ? { color: 'hsl(160 80% 75%)', borderColor: 'hsl(160 50% 40% / 0.5)', background: 'hsl(160 60% 20% / 0.4)' }
        : { color: 'hsl(348 80% 78%)', borderColor: 'hsl(348 60% 40% / 0.5)', background: 'hsl(348 60% 18% / 0.4)' }}>
      {hasTv ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
      {hasTv && hasMovies ? 'Films + Séries' : hasTv ? 'Séries' : 'Films'}
    </span>
  )
}

function CategoryTile({ cat, index }: { cat: CategoryDef; index: number }) {
  const Icon = CATEGORY_ICONS[cat.label] || Clapperboard
  const hue = cat.hue
  const hasTv = Boolean(cat.tv)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.04, ease: 'easeOut' }}
      className="h-full"
    >
      <Link
        href={`/category/${encodeURIComponent(cat.label)}`}
        className="group relative block h-full rounded-2xl overflow-hidden border border-white/10 p-5 md:p-6 transition-all duration-300 hover:scale-[1.02] hover:border-white/25 hover:shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{ background: `linear-gradient(165deg, hsl(${hue} 45% 13%), hsl(${(hue + 60) % 360} 40% 10%) 55%, hsl(${(hue + 120) % 360} 35% 8%))` }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full opacity-20 blur-[90px] transition-opacity duration-500 group-hover:opacity-35"
            style={{ background: `hsl(${hue} 90% 55%)` }} />
          <div className="absolute -bottom-24 -left-12 w-48 h-48 rounded-full opacity-15 blur-[80px] transition-opacity duration-500 group-hover:opacity-30"
            style={{ background: `hsl(${(hue + 140) % 360} 90% 50%)` }} />
        </div>

        <div className="relative flex flex-col h-full min-h-[150px] md:min-h-[170px]">
          <div className="flex items-start justify-between gap-2">
            <span className="font-display text-[11px] font-semibold tracking-[0.25em] text-white/30">
              {String(index + 1).padStart(2, '0')}
            </span>
            <TypeBadge hasMovies={true} hasTv={hasTv} />
          </div>

          <span className="mt-auto w-11 h-11 md:w-12 md:h-12 rounded-full border border-white/15 bg-white/5 backdrop-blur flex items-center justify-center text-white/80 transition-all duration-300 group-hover:text-white group-hover:border-white/35 group-hover:bg-white/10">
            <Icon className="w-5 h-5 md:w-6 md:h-6" />
          </span>

          <h2 className="mt-3 text-xl md:text-2xl font-bold font-display text-white tracking-tight leading-tight">
            {cat.label}
          </h2>
          <p className="text-xs md:text-sm text-white/45 mt-0.5">{cat.tagline}</p>

          <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
            style={{ color: `hsl(${hue} 75% 72%)` }}>
            Explorer
            <ChevronRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    </motion.div>
  )
}

export default function Categories() {
  const movieCount = CATEGORIES.length
  const tvCount = CATEGORIES.filter(c => c.tv).length

  return (
    <Layout>
      {/* ===== Hero Flux signature ===== */}
      <section className="relative overflow-hidden bg-black">
        <div className="pointer-events-none absolute -top-1/4 left-1/4 w-[55%] h-[80%] rounded-full blur-[130px] opacity-25 bg-primary" />
        <div className="pointer-events-none absolute -bottom-1/3 right-0 w-[40%] h-[60%] rounded-full blur-[130px] opacity-[0.1] bg-white/10" />
        <div className="absolute top-0 left-0 right-0 z-10 h-[3px] bg-gradient-to-r from-transparent via-primary/70 to-transparent" />

        <div className="container mx-auto px-4 md:px-6 pt-28 md:pt-36 pb-14 md:pb-20 relative z-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="max-w-3xl"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_hsl(var(--primary))]" />
              <span className="text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] text-primary">
                Explorer le catalogue
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-black font-display leading-[1.04] tracking-tight drop-shadow-[0_8px_40px_rgba(0,0,0,0.9)]">
              Catégories
            </h1>
            <p className="text-sm md:text-base text-white/60 mt-3 max-w-xl leading-relaxed">
              Parcourez tout le catalogue Flux par genre — films et séries réunis,
              pour trouver votre prochaine soirée.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 mt-6">
              <span className="inline-flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 text-xs md:text-sm font-semibold">
                <Clapperboard className="w-3.5 h-3.5 text-primary" />
                {movieCount} genres
              </span>
              <span className="inline-flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-1.5 rounded-full border border-white/10 text-xs md:text-sm font-semibold">
                <Tv className="w-3.5 h-3.5 text-emerald-400" />
                {tvCount} avec séries
              </span>
              <Link
                href="/search"
                className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-full font-semibold backdrop-blur transition-all border border-white/15 text-xs md:text-sm hover:scale-105 active:scale-95"
              >
                <Search className="w-3.5 h-3.5" />
                Rechercher un titre
              </Link>
            </div>
          </motion.div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ===== Grille des catégories ===== */}
      <div className="container mx-auto px-4 md:px-6 py-10 md:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
          {CATEGORIES.map((cat, i) => (
            <CategoryTile key={cat.label} cat={cat} index={i} />
          ))}
        </div>
      </div>
    </Layout>
  )
}
