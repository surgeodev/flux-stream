import { useParams, Link } from 'wouter'
import { Layout } from '@/components/layout'
import { Play, Star, ChevronLeft } from 'lucide-react'
import { getMovie, imgPath, bgPath, getCatalog, getMovieCredits, type MediaItem, type CastMember } from '@/hooks/use-tmdb'
import { MediaCard } from '@/components/media-card'
import { useState, useEffect } from 'react'

export default function MoviePage() {
  const params = useParams()
  const id = Number(params.id)
  const [movie, setMovie] = useState<MediaItem | undefined>(undefined)
  const [popular, setPopular] = useState<MediaItem[]>([])
  const [cast, setCast] = useState<CastMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.scrollTo(0, 0)
    Promise.all([
      getMovie(id),
      getCatalog(),
      getMovieCredits(id),
    ]).then(([m, cat, credits]) => {
      setMovie(m)
      setPopular(cat.filter(c => c.type === 'movie').slice(0, 6))
      setCast(credits)
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col">
          <div className="w-full h-[50vh] md:h-[65vh] bg-card skeleton-pulse" />
          <div className="container mx-auto px-4 md:px-6 -mt-32 md:-mt-40 relative z-10">
            <div className="flex flex-col md:flex-row gap-4 md:gap-10">
              <div className="w-28 md:w-64 flex-shrink-0 -mt-16 md:mt-0 self-start">
                <div className="aspect-[2/3] w-full rounded-xl bg-card skeleton-pulse" />
              </div>
              <div className="flex-1 pt-1 md:pt-20 space-y-3">
                <div className="h-8 md:h-12 w-3/4 bg-card skeleton-pulse rounded" />
                <div className="h-4 w-1/2 bg-card skeleton-pulse rounded" />
                <div className="h-20 w-full bg-card skeleton-pulse rounded" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (!movie) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <h1 className="text-4xl font-bold font-display mb-4">Film introuvable</h1>
          <p className="text-muted-foreground mb-6">L'ID {id} n'existe pas.</p>
          <Link href="/" className="bg-primary text-primary-foreground px-6 py-2 rounded-full font-medium">Retour à l'accueil</Link>
        </div>
      </Layout>
    )
  }

  const poster = imgPath(movie.img, 'w500')
  const backdrop = bgPath(movie.backdrop || '')

  return (
    <Layout>
      <div className="relative w-full h-[50vh] md:h-[65vh] overflow-hidden bg-black">
        {backdrop && <img src={backdrop} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12">
          <button onClick={() => window.history.back()} className="flex items-center gap-2 text-white/70 hover:text-white mb-4 transition-colors">
            <ChevronLeft className="w-5 h-5" /><span className="text-sm">Retour</span>
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 -mt-32 md:-mt-40 relative z-10">
        <div className="flex flex-col md:flex-row gap-4 md:gap-10">
          <div className="w-28 md:w-64 flex-shrink-0 -mt-16 md:mt-0 self-start">
            <img src={poster} alt={movie.title} className="w-full rounded-xl shadow-2xl border border-white/10" />
          </div>

          <div className="flex-1 pt-1 md:pt-20">
            <h1 className="text-2xl md:text-5xl font-extrabold font-display text-white drop-shadow-lg mb-3">{movie.title}</h1>

            <div className="flex items-center gap-3 text-sm flex-wrap mb-4">
              {movie.rating ? (
                <span className="flex items-center gap-1 text-yellow-400 bg-black/50 px-2.5 py-1 rounded-md backdrop-blur border border-white/10">
                  <Star className="w-3.5 h-3.5 fill-current" />{movie.rating.toFixed(1)}
                </span>
              ) : null}
              <span className="bg-white/10 px-2.5 py-1 rounded-md backdrop-blur border border-white/10 text-xs">{movie.year || ''}</span>
              {movie.genres?.map(g => (
                <span key={g} className="bg-white/10 px-2.5 py-1 rounded-md backdrop-blur border border-white/10 text-xs uppercase tracking-wide">{g}</span>
              ))}
            </div>

            {movie.overview && <p className="text-sm text-white/70 max-w-2xl leading-relaxed mb-6">{movie.overview}</p>}

            <div className="flex items-center gap-3 mb-8">
              <Link href={`/watch?type=movie&id=${movie.id}&title=${encodeURIComponent(movie.title)}`}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-6 md:px-8 py-2.5 md:py-3 rounded-full font-bold transition-all hover:scale-105 shadow-hero text-sm md:text-base">
                <Play className="w-4 h-4 md:w-5 md:h-5 fill-current" />Regarder
              </Link>
            </div>
          </div>
        </div>
      </div>

      {cast.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-10">
          <h2 className="text-xl font-bold font-display mb-6">Acteurs</h2>
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-thin">
            {cast.map(actor => (
              <div key={actor.id} className="flex flex-col items-center gap-2 min-w-[90px] md:min-w-[110px]">
                <div className="w-[80px] h-[80px] md:w-[100px] md:h-[100px] rounded-full overflow-hidden border-2 border-white/10 bg-card flex-shrink-0">
                  {actor.profile ? (
                    <img src={imgPath(actor.profile, 'w185')} alt={actor.name}
                      className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      {actor.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="text-center min-w-0">
                  <p className="text-xs font-semibold leading-tight truncate max-w-[90px] md:max-w-[110px]">{actor.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[90px] md:max-w-[110px]">{actor.character}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {popular.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-10">
          <h2 className="text-xl font-bold font-display mb-6">Films populaires</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            {popular.map(m => <MediaCard key={m.id} item={m} />)}
          </div>
        </section>
      )}
    </Layout>
  )
}
