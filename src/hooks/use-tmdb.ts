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
  }
}

const CACHE = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

async function tmdbFetch(path: string): Promise<any> {
  const key = path
  const cached = CACHE.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data
  const url = `${TMDB_API}${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}&language=fr-FR`
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

export async function getRecentMovies(): Promise<MediaItem[]> {
  try {
    const data = await tmdbFetch('/movie/now_playing')
    return safeResults(data).slice(0, 12).map((m: any) => tmdbItemToMedia(m, 'movie'))
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
    const m = safeResults(movies).slice(0, 10).map((r: any) => tmdbItemToMedia(r, 'movie'))
    const t = safeResults(tv).slice(0, 10).map((r: any) => tmdbItemToMedia(r, 'tv'))
    return [...m, ...t]
  } catch {
    return [...POPULAR_MOVIES, ...POPULAR_TV]
  }
}

export async function getMovie(id: number): Promise<MediaItem | undefined> {
  try {
    const data = await tmdbFetch(`/movie/${id}`)
    return tmdbItemToMedia(data, 'movie')
  } catch {
    return POPULAR_MOVIES.find(m => m.id === id)
  }
}

export async function getTVShow(id: number): Promise<MediaItem | undefined> {
  try {
    const data = await tmdbFetch(`/tv/${id}`)
    return tmdbItemToMedia(data, 'tv')
  } catch {
    return POPULAR_TV.find(t => t.id === id)
  }
}

export async function searchMedia(query: string): Promise<MediaItem[]> {
  try {
    const [movies, tv] = await Promise.all([
      tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}`),
      tmdbFetch(`/search/tv?query=${encodeURIComponent(query)}`),
    ])
    const m = safeResults(movies).slice(0, 6).map((r: any) => tmdbItemToMedia(r, 'movie'))
    const t = safeResults(tv).slice(0, 6).map((r: any) => tmdbItemToMedia(r, 'tv'))
    const results = [...m, ...t]
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
}

export const CLOUDFLARE_WORKER = 'https://flux-stream-api.surgeodev.workers.dev'
export const LOCAL_API = 'http://localhost:8787'
export const LOCAL_API_ALT = 'http://127.0.0.1:8787'

export const IFRAME_SOURCES = [
  { name: 'VidSrc #1', movie: (i: number) => `https://vidsrcme.ru/embed/movie/${i}`, tv: (i: number, s: number, e: number) => `https://vidsrcme.ru/embed/tv/${i}/${s}/${e}` },
  { name: 'VidSrc #2', movie: (i: number) => `https://vsembed.ru/embed/movie/${i}`, tv: (i: number, s: number, e: number) => `https://vsembed.ru/embed/tv/${i}/${s}/${e}` },
  { name: 'VidSrc #3', movie: (i: number) => `https://vidsrc.su/embed/movie/${i}`, tv: (i: number, s: number, e: number) => `https://vidsrc.su/embed/tv/${i}/${s}/${e}` },
]

async function detectLocalApi(): Promise<string | null> {
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

  const iframes: StreamSource[] = IFRAME_SOURCES.map(s => ({
    name: s.name,
    kind: 'iframe' as const,
    iframeUrl: type === 'tv' ? s.tv(id, season || 1, episode || 1) : s.movie(id),
  }))
  sources.push(...iframes)

  const localBase = await detectLocalApi()
  sources.push({
    name: 'Flux direct (local)',
    kind: 'hls',
    hlsUrl: `${localBase ?? LOCAL_API}/api/streams/${type}/${id}${type === 'tv' ? `?season=${season || 1}&episode=${episode || 1}` : ''}`,
  })

  const cloudflareParams = `tmdb=${id}&type=${type}${type === 'tv' ? `&s=${season || 1}&e=${episode || 1}` : ''}`
  sources.push({
    name: 'Cloudflare 24/7',
    kind: 'hls',
    hlsUrl: `${CLOUDFLARE_WORKER}?${cloudflareParams}`,
  })

  return sources
}
