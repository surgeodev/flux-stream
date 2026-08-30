import { useParams, Link } from 'wouter'
import { Layout } from '@/components/layout'
import { Play, Star, ChevronLeft, Clock, ThumbsUp, RotateCcw } from 'lucide-react'
import { getMovie, imgPath, bgPath, getSimilar, getMovieCredits, type MediaItem, type CastMember } from '@/hooks/use-tmdb'
import { MediaRow } from '@/components/media-row'
import { PosterImage } from '@/components/poster-image'
import { PlaylistButton } from '@/components/playlist-button'
import { LikeButton } from '@/components/like-button'
import { getProgress, clearProgress, formatWatchTime } from '@/hooks/use-watch-progress'
import { useState, useEffect } from 'react'

function formatRuntime(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m}min`
}

export default function MoviePage() {
  const params = useParams()
  const id = Number(params.id)
  const [movie, setMovie] = useState<MediaItem | undefined>(undefined)
  const [similar, setSimilar] = useState<MediaItem[]>([])
  const [cast, setCast] = useState<CastMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [resumeCleared, setResumeCleared] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    Promise.all([
      getMovie(id),
      getSimilar(id, 'movie'),
      getMovieCredits(id),
    ]).then(([m, sim, credits]) => {
      if (cancelled) return
      setMovie(m)
      setSimilar(sim)
      setCast(credits)
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setLoadError(true)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [id, retryKey])

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
          {loadError ? (
            <>
              <h1 className="text-4xl font-bold font-display mb-4">Impossible de charger</h1>
              <p className="text-muted-foreground mb-6">Une erreur réseau est survenue, le film existe peut-être. Réessaie.</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setRetryKey(k => k + 1)} className="bg-primary text-primary-foreground px-6 py-2 rounded-full font-medium hover:bg-primary/80 transition-colors">Réessayer</button>
                <Link href="/" className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full font-medium border border-white/15 transition-colors">Retour à l'accueil</Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-bold font-display mb-4">Film introuvable</h1>
              <p className="text-muted-foreground mb-6">L'ID {id} n'existe pas.</p>
              <Link href="/" className="bg-primary text-primary-foreground px-6 py-2 rounded-full font-medium">Retour à l'accueil</Link>
            </>
          )}
        </div>
      </Layout>
    )
  }

  const poster = imgPath(movie.img, 'w500')
  const backdrop = bgPath(movie.backdrop || '')
  const progress = getProgress(`movie-${movie.id}`)
  const canResume = !resumeCleared && progress && progress.t > 5 && progress.t < progress.dur * 0.92

  return (
    <Layout>
      {/* ===== Hero backdrop ===== */}
      <div className="relative w-full h-[55vh] md:h-[70vh] overflow-hidden bg-black">
        {backdrop && <img src={backdrop} alt="" className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/85 via-transparent to-transparent" />

        <button onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = '/' }}
          className="absolute top-14 left-4 md:top-16 md:left-6 z-10 w-10 h-10 rounded-full bg-black/60 hover:bg-black/85 border border-white/15 backdrop-blur-md flex items-center justify-center text-white/90 hover:text-white transition-all hover:scale-105">
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="container mx-auto px-4 md:px-6 -mt-40 md:-mt-52 relative z-10">
        <div className="flex flex-col md:flex-row gap-5 md:gap-10 items-start">
          {/* Poster */}
          <div className="hidden md:block w-64 lg:w-72 flex-shrink-0">
            <PosterImage src={poster} alt={movie.title} placeholder={movie.title} className="w-full aspect-[2/3] rounded-2xl shadow-2xl shadow-black/70 border border-white/10" />
          </div>

          <div className="flex-1 md:pt-24 lg:pt-28 min-w-0">
            <h1 className="text-3xl md:text-5xl font-black font-display text-white leading-tight drop-shadow-lg line-clamp-2">{movie.title}</h1>

            {/* Meta bar */}
            <div className="flex items-center gap-2.5 md:gap-3 text-xs md:text-sm flex-wrap mt-4">
              {movie.rating ? (
                <span className="flex items-center gap-1.5 bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-white/10">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-current" />
                  <span className="font-bold text-white">{movie.rating.toFixed(1)}</span>
                  <span className="text-white/40">/10</span>
                </span>
              ) : null}
              {movie.year > 0 && (
                <span className="bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 text-white/85">{movie.year}</span>
              )}
              {movie.runtime ? (
                <span className="bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 text-white/85 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-white/50" />{formatRuntime(movie.runtime)}
                </span>
              ) : null}
              <span className="bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 text-white/85 uppercase tracking-wide text-[10px] md:text-[11px]">Film</span>
            </div>

            {/* Genres */}
            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {movie.genres.map(g => (
                  <span key={g} className="text-[11px] md:text-xs font-medium text-primary/90 border border-primary/25 bg-primary/5 px-2.5 py-1 rounded-full">{g}</span>
                ))}
              </div>
            )}

            {movie.overview && (
              <p className="text-sm md:text-base text-white/70 max-w-2xl leading-relaxed mt-5 line-clamp-4">{movie.overview}</p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 mt-6 md:mt-7">
              <Link href={`/watch?type=movie&id=${movie.id}&title=${encodeURIComponent(movie.title)}`}
                className="inline-flex items-center gap-2.5 bg-primary hover:bg-primary/90 text-white px-7 md:px-9 py-2.5 md:py-3.5 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_hsl(var(--primary)/0.4)] text-sm md:text-base">
                <Play className="w-4 h-4 md:w-5 md:h-5 fill-current" />{canResume ? 'Reprendre' : 'Regarder'}
              </Link>
              <PlaylistButton item={movie} />
              <LikeButton item={movie} />
              <span className="hidden md:flex items-center gap-1.5 text-xs text-white/40">
                <ThumbsUp className="w-3.5 h-3.5" /> {movie.rating ? `${Math.round(movie.rating * 10)}%` : '—'} d'appréciation
              </span>
            </div>

            {canResume && (
              <div className="flex items-center gap-2 mt-3 text-[11px] md:text-xs text-white/50">
                <span className="flex items-center gap-1.5 bg-primary/10 border border-primary/25 text-primary px-2.5 py-1 rounded-full">
                  <Clock className="w-3 h-3" /> Reprendre à {formatWatchTime(progress!.t)}
                </span>
                <button
                  onClick={() => { clearProgress(`movie-${movie.id}`); window.dispatchEvent(new Event('storage')); setResumeCleared(true) }}
                  className="flex items-center gap-1 text-white/40 hover:text-white transition-colors">
                  <RotateCcw className="w-3 h-3" /> Recommencer
                </button>
              </div>
            )}

            {/* Mobile poster */}
            <div className="md:hidden mt-6 w-36">
              <img src={poster} alt={movie.title} className="w-full rounded-xl shadow-2xl shadow-black/70 border border-white/10" />
            </div>
          </div>
        </div>
      </div>

      {cast.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-10 md:py-14">
          <h2 className="text-lg md:text-2xl font-bold font-display mb-5">Acteurs</h2>
          <div className="flex gap-4 md:gap-5 overflow-x-auto pb-2 -mx-4 md:-mx-6 px-4 md:px-6 scrollbar-thin">
            {cast.map(actor => (
              <div key={actor.id} className="flex flex-col items-center gap-2.5 min-w-[90px] md:min-w-[110px]">
                <div className="w-[84px] h-[84px] md:w-[104px] md:h-[104px] rounded-full overflow-hidden border-2 border-white/10 bg-card flex-shrink-0 shadow-lg">
                  {actor.profile ? (
                    <img src={imgPath(actor.profile, 'w185')} alt={actor.name}
                      className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xl font-bold">
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

      {similar.length > 0 && (
        <section className="pb-10 md:pb-14">
          <MediaRow title="Films similaires" items={similar} />
        </section>
      )}
    </Layout>
  )
}
