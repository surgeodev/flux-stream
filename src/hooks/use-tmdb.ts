const TMDB_IMG = 'https://image.tmdb.org/t/p'
const TMDB_KEY = '32ab31eb2e3afebff1262e0657d6368c'
const TMDB_API = 'https://api.themoviedb.org/3'

const POPULAR_MOVIES = [
  { id: 550, title: 'Fight Club', year: 1999, img: '/adw6Lq9FiC9zjYEdO7q1sTbF8lz.jpg', backdrop: '/np5HmCR1Ua8HwhJMyzJJrJqEFMV.jpg', overview: 'A depressed man encounters a strange man who challenges him to fight.', genres: ['Drama'], rating: 8.4, type: 'movie' as const },
  { id: 680, title: 'Pulp Fiction', year: 1994, img: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', backdrop: '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg', overview: "The lives of two mob hitmen, a boxer, a gangster and his wife.", genres: ['Thriller', 'Crime'], rating: 8.5, type: 'movie' as const },
  { id: 155, title: 'The Dark Knight', year: 2008, img: '/qJ2tW6WMUDux911BaExvjB0gXMa.jpg', backdrop: '/nMKdUUepR0i5zn0y1T4CsSB5ez.jpg', overview: 'When the menace known as the Joker wreaks havoc on Gotham.', genres: ['Action', 'Drama', 'Crime'], rating: 8.5, type: 'movie' as const },
  { id: 27205, title: 'Inception', year: 2010, img: '/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg', backdrop: '/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg', overview: 'A thief who steals corporate secrets through dream-sharing technology.', genres: ['Action', 'Sci-Fi'], rating: 8.4, type: 'movie' as const },
  { id: 157336, title: 'Interstellar', year: 2014, img: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', backdrop: '/rAiYTfKGqDCRIIqo664sY9XZIvQ.jpg', overview: "A team of explorers travel through a wormhole in space.", genres: ['Adventure', 'Drama', 'Sci-Fi'], rating: 8.4, type: 'movie' as const },
  { id: 238, title: 'The Godfather', year: 1972, img: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', backdrop: '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg', overview: "The aging patriarch of an organized crime dynasty transfers control.", genres: ['Drama', 'Crime'], rating: 8.7, type: 'movie' as const },
]

const POPULAR_TV = [
  { id: 1399, title: 'Game of Thrones', year: 2011, img: '/u3bZgnGQ9T01sWNBue3N6Lt7fD7.jpg', backdrop: '/suopoADq0kQQYZz5iK3dCq0j2Yk.jpg', overview: 'Nine noble families fight for control over the lands of Westeros.', genres: ['Drama', 'Action', 'Adventure'], rating: 8.4, type: 'tv' as const, seasons: 8 },
  { id: 60625, title: 'Rick and Morty', year: 2013, img: '/c1izw6QYqEQ0e0mg0EvPtqoY7Kn.jpg', backdrop: '/eDnBjO6J37UjK5InFOmlNHdTJcL.jpg', overview: 'An animated series that follows the exploits of a super scientist.', genres: ['Animation', 'Comedy', 'Sci-Fi'], rating: 8.7, type: 'tv' as const, seasons: 7 },
  { id: 1396, title: 'Breaking Bad', year: 2008, img: '/ggFHVNu6YYI5L3xO1e1E2HSUlqW.jpg', backdrop: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg', overview: 'A high school chemistry teacher diagnosed with inoperable lung cancer.', genres: ['Drama', 'Crime', 'Thriller'], rating: 8.9, type: 'tv' as const, seasons: 5 },
  { id: 66732, title: 'Stranger Things', year: 2016, img: '/49WJZfE1wn3lqYRKqfj4vXzEZsY.jpg', backdrop: '/56v2KjBlU4XaOv9DOi6kIJR1ZKh.jpg', overview: 'When a young boy disappears, his mother, a police chief, and his friends.', genres: ['Drama', 'Fantasy', 'Horror'], rating: 8.6, type: 'tv' as const, seasons: 4 },
  { id: 71912, title: 'The Witcher', year: 2019, img: '/cZ0d3C73mZgQlpt7GOUGG1vV7Lb.jpg', backdrop: '/7vjaGJdYrAsynLCGFRB6bxBlADt.jpg', overview: 'Geralt of Rivia, a solitary monster hunter, struggles to find his place.', genres: ['Drama', 'Action', 'Fantasy'], rating: 8.2, type: 'tv' as const, seasons: 3 },
  { id: 76479, title: 'The Boys', year: 2019, img: '/2mtv0FbTjNqzRuqBymGxXy6T2Qe.jpg', backdrop: '/2zvT7FND41QzOOP0g3rB2XxlF6w.jpg', overview: 'A group of vigilantes set out to take down corrupt superheroes.', genres: ['Action', 'Comedy', 'Drama'], rating: 8.4, type: 'tv' as const, seasons: 4 },
]

export function imgPath(path: string, size = 'w342') {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${TMDB_IMG}/${size}${path}`
}

export function bgPath(path: string) {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return `${TMDB_IMG}/original${path}`
}

export type MediaItem = {
  id: number
  title: string
  year: number
  img: string
  backdrop?: string
  overview?: string
  genres?: string[]
  rating?: number
  type: 'movie' | 'tv'
  seasons?: number
  runtime?: number
}

function tmdbItemToMedia(item: any, type: 'movie' | 'tv'): MediaItem {
  return {
    id: item.id,
    title: item.title || item.name,
    year: item.release_date ? Number(item.release_date.slice(0, 4)) : item.first_air_date ? Number(item.first_air_date.slice(0, 4)) : 0,
    img: item.poster_path || '',
    backdrop: item.backdrop_path || '',
    overview: item.overview || '',
    genres: item.genre_ids ? [] : (item.genres?.map((g: any) => g.name) || []),
    rating: item.vote_average || 0,
    type,
    seasons: type === 'tv' ? item.number_of_seasons || item.seasons || 0 : undefined,
    runtime: type === 'movie' ? item.runtime || 0 : undefined,
  }
}

const CACHE = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

async function tmdbFetch(path: string): Promise<any> {
  const key = path
  const cached = CACHE.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data
  const url = `/api/tmdb-proxy?path=${encodeURIComponent(path)}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`TMDB ${resp.status}`)
  const data = await resp.json()
  CACHE.set(key, { data, ts: Date.now() })
  return data
}

const BLOCKED_IDS = new Set([233643])
const ADULT_KEYWORDS = ['téton', 'tétons', 'hentai', 'seins', 'sexe', 'nu ', 'nue ', 'erotic', 'érotique']

function isAdult(r: any) {
  if (r.adult || r.softcore) return true
  if (BLOCKED_IDS.has(r.id)) return true
  const title = (r.title || r.name || '').toLowerCase()
  const overview = (r.overview || '').toLowerCase()
  for (const kw of ADULT_KEYWORDS) {
    if (title.includes(kw) || overview.includes(kw)) return true
  }
  return false
}

function safeResults(data: any) {
  return (data.results || []).filter((r: any) => !isAdult(r))
}

export async function getTrending(): Promise<MediaItem[]> {
  try {
    const [movies, tv] = await Promise.all([
      tmdbFetch('/trending/movie/week'),
      tmdbFetch('/trending/tv/week'),
    ])
    const m = safeResults(movies).slice(0, 5).map((r: any) => tmdbItemToMedia(r, 'movie'))
    const t = safeResults(tv).slice(0, 5).map((r: any) => tmdbItemToMedia(r, 'tv'))
    return [...m, ...t].sort(() => Math.random() - 0.5)
  } catch {
    return [...POPULAR_MOVIES, ...POPULAR_TV].sort(() => Math.random() - 0.5)
  }
}

export async function getVideos(id: number, type: 'movie' | 'tv'): Promise<{ key: string; name: string; kind: string }[]> {
  try {
    const data = await tmdbFetch(`/${type === 'movie' ? 'movie' : 'tv'}/${id}/videos`)
    return (data.results || [])
      .filter((v: any) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
      .map((v: any) => ({ key: v.key, name: v.name, kind: v.type }))
  } catch {
    return []
  }
}

export async function getRecentMovies(): Promise<MediaItem[]> {
  try {
    const [data, extra] = await Promise.all([
      tmdbFetch('/movie/now_playing'),
      tmdbFetch('/movie/upcoming'),
    ])
    const seen = new Set<number>()
    const items = [...safeResults(data), ...safeResults(extra)]
      .filter(r => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
      .slice(0, 14)
      .map((m: any) => tmdbItemToMedia(m, 'movie'))
    return items.sort(() => Math.random() - 0.5)
  } catch {
    return POPULAR_MOVIES
  }
}

export async function getCatalog(): Promise<MediaItem[]> {
  try {
    const [movies, tv] = await Promise.all([
      tmdbFetch('/movie/popular'),
      tmdbFetch('/tv/popular'),
    ])
    const m = safeResults(movies).slice(0, 14).map((r: any) => tmdbItemToMedia(r, 'movie'))
    const t = safeResults(tv).slice(0, 14).map((r: any) => tmdbItemToMedia(r, 'tv'))
    return [...m, ...t].sort(() => Math.random() - 0.5)
  } catch {
    return [...POPULAR_MOVIES, ...POPULAR_TV]
  }
}

export type GenreDef = { id: number; name: string }

export type CategoryDef = {
  label: string
  movies: GenreDef
  tv?: GenreDef
  sort?: string
  hue: number
  tagline: string
}

export const HOME_GENRES: CategoryDef[] = [
  { label: 'Action', movies: { id: 28, name: 'Action' }, tv: { id: 10759, name: 'Action & Adventure' }, sort: 'popularity.desc', hue: 20, tagline: 'Adrénaline et cascades' },
  { label: 'Science-fiction', movies: { id: 878, name: 'Science-Fiction' }, tv: { id: 10765, name: 'Sci-Fi & Fantastique' }, sort: 'vote_count.desc', hue: 200, tagline: 'Futurs et mondes lointains' },
  { label: 'Comédie', movies: { id: 35, name: 'Comédie' }, tv: { id: 35, name: 'Comédie' }, sort: 'release_date.desc', hue: 48, tagline: 'Rire garanti' },
  { label: 'Drame', movies: { id: 18, name: 'Drame' }, tv: { id: 18, name: 'Drame' }, sort: 'vote_average.desc', hue: 262, tagline: 'Émotions intenses' },
  { label: 'Horreur', movies: { id: 27, name: 'Horreur' }, sort: 'popularity.desc', hue: 0, tagline: 'Frayeurs assurées' },
  { label: 'Animation', movies: { id: 16, name: 'Animation' }, tv: { id: 16, name: 'Animation' }, sort: 'vote_count.desc', hue: 320, tagline: 'Tout public' },
  { label: 'Thriller', movies: { id: 53, name: 'Thriller' }, tv: { id: 80, name: 'Crime' }, sort: 'release_date.desc', hue: 175, tagline: 'Suspense et tension' },
  { label: 'Romance', movies: { id: 10749, name: 'Romance' }, tv: { id: 10749, name: 'Romance' }, sort: 'vote_average.desc', hue: 348, tagline: 'Histoires d\'amour' },
  { label: 'Aventure', movies: { id: 12, name: 'Aventure' }, tv: { id: 10759, name: 'Action & Adventure' }, sort: 'popularity.desc', hue: 145, tagline: 'Évasions épiques' },
  { label: 'Fantastique', movies: { id: 14, name: 'Fantastique' }, tv: { id: 10765, name: 'Sci-Fi & Fantastique' }, sort: 'vote_count.desc', hue: 285, tagline: 'Magie et créatures' },
  { label: 'Mystère', movies: { id: 9648, name: 'Mystère' }, tv: { id: 80, name: 'Crime' }, sort: 'popularity.desc', hue: 32, tagline: 'Énigmes à résoudre' },
  { label: 'Documentaire', movies: { id: 99, name: 'Documentaire' }, tv: { id: 99, name: 'Documentaire' }, sort: 'vote_average.desc', hue: 60, tagline: 'Le réel raconté' },
]

export const CATEGORIES: CategoryDef[] = [
  ...HOME_GENRES,
  { label: 'Guerre', movies: { id: 10752, name: 'Guerre' }, sort: 'vote_average.desc', hue: 350, tagline: 'Conflits et bravoure' },
  { label: 'Western', movies: { id: 37, name: 'Western' }, sort: 'popularity.desc', hue: 25, tagline: 'Conquête de l\'Ouest' },
  { label: 'Musique', movies: { id: 10402, name: 'Musique' }, tv: { id: 10402, name: 'Musique' }, sort: 'popularity.desc', hue: 300, tagline: 'Bandes-son et concerts' },
  { label: 'Crime', movies: { id: 80, name: 'Crime' }, tv: { id: 80, name: 'Crime' }, sort: 'vote_count.desc', hue: 210, tagline: 'Enquêtes et affaires' },
  { label: 'Famille', movies: { id: 10751, name: 'Famille' }, tv: { id: 10751, name: 'Famille' }, sort: 'vote_average.desc', hue: 140, tagline: 'À partager' },
  { label: 'Histoire', movies: { id: 36, name: 'Histoire' }, sort: 'popularity.desc', hue: 45, tagline: 'Passés reconstitués' },
]

export async function getByGenre(type: 'movie' | 'tv', genreId: number, sort?: string, page = 1): Promise<MediaItem[]> {
  try {
    const s = sort || 'popularity.desc'
    const data = await tmdbFetch(`/discover/${type}?with_genres=${genreId}&sort_by=${s}&vote_count.gte=200&page=${page}`)
    const items = safeResults(data).slice(0, 16).map((r: any) => tmdbItemToMedia(r, type))
    if (items.length < 8 && page === 1) {
      const alt = await tmdbFetch(`/discover/${type}?with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100&page=2`)
      items.push(...safeResults(alt).slice(0, 8).map((r: any) => tmdbItemToMedia(r, type)))
    }
    return items
  } catch {
    return []
  }
}

export async function getGenreSection(label: string, movies: GenreDef, tv: GenreDef | undefined, sort?: string): Promise<MediaItem[]> {
  try {
    const [m, t] = await Promise.all([
      getByGenre('movie', movies.id, sort),
      tv ? getByGenre('tv', tv.id, sort).then(list => list.map(i => ({ ...i }))) : Promise.resolve([]),
    ])
    const seen = new Set<string>()
    const merged: MediaItem[] = []
    for (const item of [...m, ...t]) {
      const k = `${item.type}-${item.id}`
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(item)
      if (merged.length >= 18) break
    }
    return merged.sort(() => Math.random() - 0.5)
  } catch {
    return []
  }
}

export async function getCategoryGrid(cat: CategoryDef, page = 1): Promise<MediaItem[]> {
  try {
    const [m, t] = await Promise.all([
      getByGenre('movie', cat.movies.id, cat.sort, page),
      cat.tv ? getByGenre('tv', cat.tv.id, cat.sort, page).then(list => list.map(i => ({ ...i }))) : Promise.resolve([]),
    ])
    const seen = new Set<string>()
    const merged: MediaItem[] = []
    for (const item of [...m, ...t]) {
      const k = `${item.type}-${item.id}`
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(item)
    }
    return merged
  } catch {
    return []
  }
}

export async function getTopRated(): Promise<MediaItem[]> {
  try {
    const [movies, tv] = await Promise.all([
      tmdbFetch('/movie/top_rated'),
      tmdbFetch('/tv/top_rated'),
    ])
    const m = safeResults(movies).slice(0, 5).map((r: any) => tmdbItemToMedia(r, 'movie'))
    const t = safeResults(tv).slice(0, 5).map((r: any) => tmdbItemToMedia(r, 'tv'))
    return [...m, ...t].sort((a, b) => (b.rating || 0) - (a.rating || 0))
  } catch {
    return [...POPULAR_MOVIES, ...POPULAR_TV].sort((a, b) => (b.rating || 0) - (a.rating || 0))
  }
}

export async function getMovie(id: number): Promise<MediaItem | undefined> {
  try {
    const data = await tmdbFetch(`/movie/${id}`)
    return tmdbItemToMedia(data, 'movie')
  } catch (e: any) {
    if (e?.message === 'TMDB 404') return undefined
    const hardcoded = POPULAR_MOVIES.find(m => m.id === id)
    if (hardcoded) return hardcoded
    throw e
  }
}

export async function getSimilar(id: number, type: 'movie' | 'tv'): Promise<MediaItem[]> {
  try {
    const data = await tmdbFetch(`/${type}/${id}/similar`)
    return safeResults(data).slice(0, 10).map((r: any) => tmdbItemToMedia(r, type))
  } catch {
    return []
  }
}

export async function getFranchiseSuggestions(id: number, type: 'movie' | 'tv', title: string): Promise<MediaItem[]> {
  const seen = new Set<string>([`${type}-${id}`])
  const out: MediaItem[] = []
  const push = (items: MediaItem[]) => {
    for (const it of items) {
      const k = `${it.type}-${it.id}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(it)
    }
  }

  const similar = await getSimilar(id, type)
  push(similar)

  const name = (title || '').toLowerCase().trim()
  if (name.length >= 2) {
    try {
      const data = await tmdbFetch(`/search/multi?query=${encodeURIComponent(name)}&include_adult=false`)
      const hits = safeResults(data)
        .filter((r: any) => r.media_type === type || (r.media_type === 'movie' && type === 'movie'))
        .slice(0, 10)
        .map((r: any) => tmdbItemToMedia(r, r.media_type || type))
      push(hits)
    } catch { /* ignore */ }
  }

  return out.slice(0, 10)
}

export async function getTVShow(id: number): Promise<MediaItem | undefined> {
  try {
    const data = await tmdbFetch(`/tv/${id}`)
    return tmdbItemToMedia(data, 'tv')
  } catch (e: any) {
    if (e?.message === 'TMDB 404') return undefined
    const hardcoded = POPULAR_TV.find(t => t.id === id)
    if (hardcoded) return hardcoded
    throw e
  }
}

export async function getSeasonEpisodes(id: number, season: number): Promise<{ episodeNumber: number; name: string; overview: string; still: string }[]> {
  try {
    const data = await tmdbFetch(`/tv/${id}/season/${season}`)
    return (data.episodes || [])
      .map((e: any) => ({
        episodeNumber: e.episode_number,
        name: e.name || `Épisode ${e.episode_number}`,
        overview: e.overview || '',
        still: e.still_path || '',
      }))
      .filter((e: any) => e.episodeNumber > 0)
  } catch {
    return []
  }
}

export async function searchMedia(query: string): Promise<MediaItem[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const data = await res.json()
    const results = (data.results || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      year: r.year ? Number(r.year) : 0,
      img: r.poster ? imgPath(r.poster) : '',
      backdrop: '',
      overview: '',
      genres: [],
      rating: r.rating || 0,
      type: r.type || 'movie',
    }))
    if (results.length > 0) return results
  } catch {}

  const q = query.toLowerCase()
  return [...POPULAR_MOVIES, ...POPULAR_TV].filter(m =>
    m.title.toLowerCase().includes(q) ||
    (m.genres && m.genres.some(g => g.toLowerCase().includes(q)))
  )
}

export type CastMember = {
  id: number
  name: string
  character: string
  profile: string
}

export async function getMovieCredits(id: number): Promise<CastMember[]> {
  try {
    const data = await tmdbFetch(`/movie/${id}/credits`)
    return (data.cast || []).slice(0, 12).map((c: any) => ({
      id: c.id,
      name: c.name || '',
      character: c.character || '',
      profile: c.profile_path || '',
    }))
  } catch { return [] }
}

export async function getTVCredits(id: number): Promise<CastMember[]> {
  try {
    const data = await tmdbFetch(`/tv/${id}/credits`)
    return (data.cast || []).slice(0, 12).map((c: any) => ({
      id: c.id,
      name: c.name || '',
      character: c.character || '',
      profile: c.profile_path || '',
    }))
  } catch { return [] }
}

export type StreamSource = {
  name: string
  kind: 'iframe'
  iframeUrl: string
} | {
  name: string
  kind: 'hls'
  hlsUrl: string
  detail?: string
}

export const LOCAL_API = 'http://localhost:8787'
export const LOCAL_API_ALT = 'http://127.0.0.1:8787'

export function rewriteLocalUrl(u: string): string {
  if (!u) return u
  const host = typeof location !== 'undefined' ? location.hostname : 'localhost'
  return u
    .replace('http://localhost:8787', `http://${host}:8787`)
    .replace('http://127.0.0.1:8787', `http://${host}:8787`)
}

export const IFRAME_SOURCES = [
  { name: 'Vidéo HD', movie: (i: number) => `https://vidsrc.to/embed/movie/${i}`, tv: (i: number, s: number, e: number) => `https://vidsrc.to/embed/tv/${i}/${s}/${e}` },
  { name: 'CinéMax', movie: (i: number) => `https://vidsrc.su/embed/movie/${i}`, tv: (i: number, s: number, e: number) => `https://vidsrc.su/embed/tv/${i}/${s}/${e}` },
  { name: 'Stream Prime', movie: (i: number) => `https://vidsrc.pm/embed/movie/${i}`, tv: (i: number, s: number, e: number) => `https://vidsrc.pm/embed/tv/${i}/${s}/${e}` },
]

async function detectLocalApi(): Promise<string | null> {
  const sameHost = await fetch('/api/health', { signal: AbortSignal.timeout(2000) })
    .then(r => r.ok)
    .catch(() => false)
  if (sameHost) return ''
  for (const base of [LOCAL_API, LOCAL_API_ALT]) {
    const ok = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) })
      .then(r => r.ok)
      .catch(() => false)
    if (ok) return base
  }
  return null
}

export async function getIframeSources(id: number, type: string, season?: number, episode?: number): Promise<StreamSource[]> {
  const sources: StreamSource[] = []

  // 1) Flux (HLS direct) en premier
  const localBase = await detectLocalApi()
  sources.push({
    name: 'Flux',
    kind: 'hls',
    hlsUrl: `${localBase ?? LOCAL_API}/api/streams/${type === 'tv' ? 'series' : type}/${id}${type === 'tv' ? `?season=${season || 1}&episode=${episode || 1}` : ''}`,
  })

  // 2) Sources externes en secours
  for (const s of IFRAME_SOURCES) {
    sources.push({
      name: s.name,
      kind: 'iframe' as const,
      iframeUrl: type === 'tv' ? s.tv(id, season || 1, episode || 1) : s.movie(id),
    })
  }

  // 3) Wiflix VF (films + séries) — via notre proxy, apparaît comme choix normal
  try {
    const wiflixRes = await fetch(`/api/wiflix/resolve?tmdb_id=${id}&type=${type}&season=${season || 1}&episode=${episode || 1}`, { signal: AbortSignal.timeout(8000) })
    if (wiflixRes.ok) {
      const wj = await wiflixRes.json()
      if (wj.url) {
        sources.push({ name: 'Wiflix VF', kind: 'iframe' as const, iframeUrl: wj.url })
      }
    }
  } catch {}

  return sources
}
