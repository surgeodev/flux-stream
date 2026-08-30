import { useParams, Link } from 'wouter'
import { Layout } from '@/components/layout'
import { Play, Star, ChevronLeft, Tv } from 'lucide-react'
import { getTVShow, getSeasonEpisodes, imgPath, bgPath, getSimilar, getTVCredits, type MediaItem, type CastMember } from '@/hooks/use-tmdb'
import { MediaRow } from '@/components/media-row'
import { PosterImage } from '@/components/poster-image'
import { PlaylistButton } from '@/components/playlist-button'
import { LikeButton } from '@/components/like-button'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { getProgress } from '@/hooks/use-watch-progress'

export default function TVPage() {
  const params = useParams()
  const id = Number(params.id)
  const [show, setShow] = useState<MediaItem | undefined>(undefined)
  const [similar, setSimilar] = useState<MediaItem[]>([])
  const [cast, setCast] = useState<CastMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [selectedSeason, setSelectedSeason] = useState(1)
  const [selectedEpisode, setSelectedEpisode] = useState(1)
  const [episodes, setEpisodes] = useState<{ episodeNumber: number; name: string; overview: string; still: string }[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    Promise.all([
      getTVShow(id),
      getSimilar(id, 'tv'),
      getTVCredits(id),
    ]).then(([s, sim, credits]) => {
      if (cancelled) return
      setShow(s)
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

  useEffect(() => {
    if (!show) return
    setEpisodesLoading(true)
    getSeasonEpisodes(show.id, selectedSeason).then(list => {
      if (list.length > 0) {
        setEpisodes(list)
        if (selectedEpisode > list.length) setSelectedEpisode(1)
      } else {
        setEpisodes([])
      }
      setEpisodesLoading(false)
    })
  }, [show, selectedSeason])

  useEffect(() => {
    setSelectedEpisode(1)
  }, [selectedSeason])

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

  if (!show) {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          {loadError ? (
            <>
              <h1 className="text-4xl font-bold font-display mb-4">Impossible de charger</h1>
              <p className="text-muted-foreground mb-6">Une erreur réseau est survenue, la série existe peut-être. Réessaie.</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setRetryKey(k => k + 1)} className="bg-primary text-primary-foreground px-6 py-2 rounded-full font-medium hover:bg-primary/80 transition-colors">Réessayer</button>
                <Link href="/" className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-full font-medium border border-white/15 transition-colors">Retour à l'accueil</Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-bold font-display mb-4">Série introuvable</h1>
              <p className="text-muted-foreground mb-6">L'ID {id} n'existe pas.</p>
              <Link href="/" className="bg-primary text-primary-foreground px-6 py-2 rounded-full font-medium">Retour à l'accueil</Link>
            </>
          )}
        </div>
      </Layout>
    )
  }

  const poster = imgPath(show.img, 'w500')
  const backdrop = bgPath(show.backdrop || '')

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
            <PosterImage src={poster} alt={show.title} placeholder={show.title} className="w-full aspect-[2/3] rounded-2xl shadow-2xl shadow-black/70 border border-white/10" />
          </div>

          <div className="flex-1 md:pt-24 lg:pt-28 min-w-0">
            <h1 className="text-3xl md:text-5xl font-black font-display text-white leading-tight drop-shadow-lg line-clamp-2">{show.title}</h1>

            {/* Meta bar */}
            <div className="flex items-center gap-2.5 md:gap-3 text-xs md:text-sm flex-wrap mt-4">
              {show.rating ? (
                <span className="flex items-center gap-1.5 bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-white/10">
                  <Star className="w-3.5 h-3.5 text-yellow-400 fill-current" />
                  <span className="font-bold text-white">{show.rating.toFixed(1)}</span>
                  <span className="text-white/40">/10</span>
                </span>
              ) : null}
              {show.year > 0 && (
                <span className="bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 text-white/85">{show.year}</span>
              )}
              {show.seasons ? (
                <span className="bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 text-white/85">{show.seasons} saisons</span>
              ) : null}
              <span className="bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-white/10 text-white/85 uppercase tracking-wide text-[10px] md:text-[11px]">Série</span>
            </div>

            {/* Genres */}
            {show.genres && show.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {show.genres.map(g => (
                  <span key={g} className="text-[11px] md:text-xs font-medium text-primary/90 border border-primary/25 bg-primary/5 px-2.5 py-1 rounded-full">{g}</span>
                ))}
              </div>
            )}

            {show.overview && (
              <p className="text-sm md:text-base text-white/70 max-w-2xl leading-relaxed mt-5 line-clamp-4">{show.overview}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-6 md:mt-7">
              <Link href={`/watch?type=tv&id=${show.id}&title=${encodeURIComponent(show.title)}&s=${selectedSeason}&e=${selectedEpisode}`}
                className="inline-flex items-center gap-2.5 bg-primary hover:bg-primary/90 text-white px-7 md:px-9 py-2.5 md:py-3.5 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_hsl(var(--primary)/0.4)] text-sm md:text-base">
                <Play className="w-4 h-4 md:w-5 md:h-5 fill-current" />Regarder S{selectedSeason}E{selectedEpisode}
              </Link>
              <PlaylistButton item={show} />
              <LikeButton item={show} />
              <span className="hidden md:flex items-center gap-1.5 text-xs text-white/40">
                <Tv className="w-3.5 h-3.5" /> {show.seasons || '—'} saisons
              </span>
            </div>

            {/* Mobile poster */}
            <div className="md:hidden mt-6 w-36">
              <img src={poster} alt={show.title} className="w-full rounded-xl shadow-2xl shadow-black/70 border border-white/10" />
            </div>
          </div>
        </div>
      </div>

      {/* ===== Episodes ===== */}
      <section className="container mx-auto px-4 md:px-6 py-10 md:py-14">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <h2 className="text-lg md:text-2xl font-bold font-display">Épisodes</h2>
          <select value={selectedSeason} onChange={e => setSelectedSeason(Number(e.target.value))}
            className="bg-card border border-white/10 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            {Array.from({ length: show.seasons || 1 }, (_, i) => i + 1).map(s => (
              <option key={s} value={s}>Saison {s}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {episodesLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[16/9] rounded-xl bg-card skeleton-pulse" />
            ))
          ) : episodes.length > 0 ? (
            episodes.map(ep => {
              const epKey = `tv-${show.id}-s${selectedSeason}e${ep.episodeNumber}`
              const prog = getProgress(epKey)
              const pct = prog && prog.dur > 0 ? (prog.t / prog.dur) * 100 : 0
              const still = ep.still ? imgPath(ep.still, 'w780') : null
              return (
                <Link
                  key={ep.episodeNumber}
                  href={`/watch?type=tv&id=${show.id}&title=${encodeURIComponent(show.title)}&s=${selectedSeason}&e=${ep.episodeNumber}`}
                  onClick={() => setSelectedEpisode(ep.episodeNumber)}
                  className={cn(
                    'group flex flex-col overflow-hidden border rounded-xl transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40',
                    ep.episodeNumber === selectedEpisode
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-white/10 bg-card hover:border-white/25'
                  )}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video w-full overflow-hidden bg-black/40">
                    {still ? (
                      <img src={still} alt="" loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/15 to-transparent">
                        <span className="text-2xl font-black text-white/25">{selectedSeason}.{String(ep.episodeNumber).padStart(2, '0')}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    {/* Play badge */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <span className="w-12 h-12 rounded-full bg-black/60 backdrop-blur border border-white/25 flex items-center justify-center">
                        <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                      </span>
                    </div>
                    {/* Top-left ep label */}
                    <span className={cn('absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md backdrop-blur',
                      ep.episodeNumber === selectedEpisode ? 'bg-primary text-white' : 'bg-black/60 text-white/80')}>
                      Ép. {ep.episodeNumber}
                    </span>
                    {/* Progress bar */}
                    {prog && pct > 2 && pct < 99 && (
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  {/* Body */}
                  <div className="flex flex-col p-3 gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-white leading-snug line-clamp-1">{ep.name}</span>
                      {prog && pct > 2 && pct < 99 && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-primary shrink-0 mt-0.5">Reprendre</span>
                      )}
                    </div>
                    {ep.overview ? (
                      <p className="text-[11px] text-white/45 leading-relaxed line-clamp-2">{ep.overview}</p>
                    ) : (
                      <p className="text-[11px] text-white/25">Aucune description.</p>
                    )}
                  </div>
                </Link>
              )
            })
          ) : (
            <p className="col-span-full text-sm text-muted-foreground py-8 text-center">Aucun épisode trouvé pour cette saison.</p>
          )}
        </div>
      </section>

      {cast.length > 0 && (
        <section className="container mx-auto px-4 md:px-6 py-4 md:py-8">
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
          <MediaRow title="Séries similaires" items={similar} />
        </section>
      )}
    </Layout>
  )
}
