interface Env {
  VIDSRC_API: string
}

interface StreamResult {
  name: string | null
  stream: string | null
  referer: string
}

const BASE_URL = 'https://vixsrc.to'
const VIXSRC_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': BASE_URL,
  'Origin': BASE_URL,
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

// Step 1: GET /api/movie/{id} or /api/tv/{id}/{s}/{e} → { src: "/embed/..." }
async function fetchApi(url: string): Promise<any | null> {
  try {
    const response = await fetch(url, { headers: VIXSRC_HEADERS })
    if (response.status !== 200) return null
    return await response.json()
  } catch {
    return null
  }
}

// Step 2: GET BASE_URL + sublink.src → HTML embed page
async function fetchEmbedPage(suburl: string): Promise<string | null> {
  try {
    const response = await fetch(BASE_URL + suburl, {
      headers: { ...VIXSRC_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*' },
    })
    if (response.status !== 200) return null
    return await response.text()
  } catch {
    return null
  }
}

// Step 3: Extract token, expires, playlist URL from embed HTML
function extractTokenData(html: string): { token: string; expires: string; playlist: string } | null {
  const token = html.match(/token["']\s*:\s*["']([^"']+)/)?.[1]
  const expires = html.match(/expires["']\s*:\s*["']([^"']+)/)?.[1]
  const playlist = html.match(/url\s*:\s*["']([^"']+)/)?.[1]

  if (!token || !expires || !playlist) return null

  // Reject expired tokens (with 60s grace period)
  if (parseInt(expires, 10) * 1000 - 60_000 < Date.now()) {
    return null
  }

  return { token, expires, playlist }
}

// Step 4: Append token params to master URL
function buildMasterUrl(tokenData: { token: string; expires: string; playlist: string }): string {
  const { token, expires, playlist } = tokenData
  const sep = playlist.includes('?') ? '&' : '?'
  return `${playlist}${sep}token=${token}&expires=${expires}&h=1`
}

// Step 5: Fetch the master HLS playlist to verify it's live
async function fetchPlaylist(masterUrl: string, pageApiUrl: string): Promise<string | null> {
  try {
    const response = await fetch(masterUrl, {
      headers: { ...VIXSRC_HEADERS, Referer: pageApiUrl },
    })
    if (response.status !== 200) return null
    return await response.text()
  } catch {
    return null
  }
}

// Step 6: Parse HLS manifest for the highest quality variant
function parsePlaylist(content: string): { quality: string; subtitles: { url: string; label: string }[] } {
  const subtitles: { url: string; label: string }[] = []

  for (const line of content.split('\n')) {
    if (!line.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')) continue
    const url = line.match(/URI="([^"]+)"/)?.[1]
    if (!url) continue
    const label = line.match(/NAME="([^"]+)"/)?.[1] ?? 'unknown'
    subtitles.push({ url, label })
  }

  const variantRegex = /#EXT-X-STREAM-INF:[^\n]*RESOLUTION=\d+x(\d+)[^\n]*\n([^\n]+)/g
  let match
  let bestResolution = 0
  while ((match = variantRegex.exec(content)) !== null) {
    const res = parseInt(match[1], 10)
    if (res > bestResolution) bestResolution = res
  }

  return { quality: bestResolution > 0 ? `${bestResolution}p` : 'auto', subtitles }
}

// Sum of EXTINF durations in a playlist (seconds)
function playlistTotalDuration(content: string): number {
  let total = 0
  for (const line of content.split('\n')) {
    if (line.startsWith('#EXTINF:')) {
      const d = parseFloat(line.slice(8))
      if (isFinite(d) && d > 0) total += d
    }
  }
  return total
}

// Check the playlist actually contains a full movie, not a ~60s error reel
async function probeDurationSeconds(content: string, baseUrl: string, referer: string): Promise<{ seconds: number; checked: boolean }> {
  const direct = playlistTotalDuration(content)
  if (!/#EXT-X-STREAM-INF:/.test(content)) {
    return { seconds: direct, checked: true }
  }
  const variantMatch = content.match(/#EXT-X-STREAM-INF:[^\n]*\n([^\n]+)/)
  if (!variantMatch) return { seconds: direct, checked: true }
  try {
    const variantUrl = new URL(variantMatch[1], baseUrl).href
    const res = await fetch(variantUrl, { headers: { ...VIXSRC_HEADERS, Referer: referer } })
    if (!res.ok) return { seconds: 0, checked: false }
    const text = await res.text()
    const dur = playlistTotalDuration(text)
    return { seconds: dur > 0 ? dur : direct, checked: dur > 0 }
  } catch {
    return { seconds: 0, checked: false }
  }
}

async function resolveVixsrc(tmdb: string, type: string, season: string, episode: string): Promise<StreamResult[]> {
  const apiUrl = type === 'movie'
    ? `${BASE_URL}/api/movie/${tmdb}`
    : `${BASE_URL}/api/tv/${tmdb}/${season}/${episode}`

  const apiData = await fetchApi(apiUrl)
  if (!apiData || !apiData.src) return []

  const html = await fetchEmbedPage(apiData.src)
  if (!html) return []

  const tokenData = extractTokenData(html)
  if (!tokenData) return []

  const masterUrl = buildMasterUrl(tokenData)

  const playlistContent = await fetchPlaylist(masterUrl, apiUrl)
  if (!playlistContent) return []

  const { quality, subtitles } = parsePlaylist(playlistContent)

  const result: StreamResult = {
    name: `Vixsrc - ${quality}`,
    stream: masterUrl,
    referer: apiUrl,
  }
  return [result]
}

async function resolveVidlink(tmdb: string, type: string, season: string, episode: string): Promise<StreamResult[]> {
  try {
    const encRes = await fetch(`https://enc-dec.app/api/enc-vidlink?text=${encodeURIComponent(tmdb)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (encRes.status !== 200) return []
    const encData: any = await encRes.json()
    const encodedTmdb = encData && encData.result
    if (!encodedTmdb) return []

    const apiUrl = type === 'tv'
      ? `https://vidlink.pro/api/b/tv/${encodedTmdb}/${season}/${episode}?multiLang=0`
      : `https://vidlink.pro/api/b/movie/${encodedTmdb}?multiLang=0`

    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Referer': 'https://vidlink.pro',
      },
    })
    if (apiRes.status !== 200) return []
    const apiData: any = await apiRes.json()

    const qualities = apiData && apiData.stream && apiData.stream.qualities
    if (!qualities) return []

    const best = Object.keys(qualities)
      .map(q => ({ q: parseInt(q, 10) || 0, ...qualities[q] }))
      .sort((a: any, b: any) => b.q - a.q)[0]
    if (!best || !best.url) return []

    return [{
      name: `Vidlink - ${best.q}p`,
      stream: best.url,
      referer: 'https://vidlink.pro',
    }]
  } catch {
    return []
  }
}

// Rewrite HLS manifests so every URL goes through this worker (CORS-safe)
function rewriteM3u8(content: string, targetUrl: string, baseProxyUrl: string, headers: Record<string, string>): string {
  const lines = content.split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (line.startsWith('#')) {
      if (line.startsWith('#EXT-X-KEY:')) {
        let keyUrl = line.match(/https?:\/\/[^"\s]+/)?.[0] ?? null
        if (!keyUrl) {
          const uri = line.match(/URI="([^"]+)"/)?.[1]
          if (uri) {
            try { keyUrl = new URL(uri, targetUrl).href } catch { keyUrl = null }
          }
        }
        if (keyUrl) {
          const proxyUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(keyUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`
          out.push(line.replace(/URI="[^"]+"/, `URI="${proxyUrl}"`))
        } else out.push(line)
      } else if (line.startsWith('#EXT-X-MEDIA:') || line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')) {
        const uri = line.match(/URI="([^"]+)"/)?.[1]
        if (uri) {
          try {
            const mediaUrl = new URL(uri, targetUrl).href
            const proxyUrl = `${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(mediaUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`
            out.push(line.replace(uri, proxyUrl))
          } catch { out.push(line) }
        } else out.push(line)
      } else out.push(line)
    } else if (line.trim()) {
      try {
        const abs = new URL(line, targetUrl).href
        if (/\.m3u8(\?|$)/i.test(abs) || /\/playlist\//i.test(abs)) {
          out.push(`${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(abs)}&headers=${encodeURIComponent(JSON.stringify(headers))}`)
        } else if (/\.ts(\?|$)/i.test(abs)) {
          out.push(`${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(abs)}&headers=${encodeURIComponent(JSON.stringify(headers))}`)
        } else out.push(line)
      } catch { out.push(line) }
    } else out.push(line)
  }
  return out.join('\n')
}

async function handleM3u8Proxy(request: Request, url: URL): Promise<Response> {
  const targetUrl = url.searchParams.get('url')
  if (!targetUrl) return json({ error: 'url param required' }, 400)
  let headers: Record<string, string> = {}
  try { headers = JSON.parse(url.searchParams.get('headers') || '{}') } catch { /* ignore */ }
  const upstream = await fetch(targetUrl, { headers: { 'User-Agent': VIXSRC_HEADERS['User-Agent'], ...headers } })
  if (!upstream.ok) return json({ error: `upstream ${upstream.status}` }, upstream.status)
  const content = await upstream.text()
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
  const baseProxyUrl = `${proto}://${url.host}`
  const rewritten = rewriteM3u8(content, targetUrl, baseProxyUrl, headers)
  return new Response(rewritten, {
    headers: {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-cache, no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

async function handleTsProxy(request: Request, url: URL): Promise<Response> {
  const targetUrl = url.searchParams.get('url')
  if (!targetUrl) return json({ error: 'url param required' }, 400)
  let headers: Record<string, string> = {}
  try { headers = JSON.parse(url.searchParams.get('headers') || '{}') } catch { /* ignore */ }
  const upstreamHeaders: Record<string, string> = { 'User-Agent': VIXSRC_HEADERS['User-Agent'], ...headers }
  const range = request.headers.get('range')
  if (range) upstreamHeaders['Range'] = range
  const upstream = await fetch(targetUrl, { headers: upstreamHeaders })
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
  const body = new Uint8Array(await upstream.arrayBuffer())
  const resp = new Response(body, { status: upstream.status, headers: {
    'Content-Type': contentType,
    'Content-Length': String(body.byteLength),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-cache, no-store',
  } })
  if (upstream.headers.get('content-range')) resp.headers.set('Content-Range', upstream.headers.get('content-range')!)
  return resp
}

const TMDB_KEY = '32ab31eb2e3afebff1262e0657d6368c'

async function tmdbLookup(tmdb: string, type: string): Promise<{ title: string; year: string; imdbId: string } | null> {
  try {
    const t = type === 'tv' ? 'tv' : 'movie'
    const res = await fetch(`https://api.themoviedb.org/3/${t}/${tmdb}?api_key=${TMDB_KEY}&append_to_response=external_ids`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) return null
    const d: any = await res.json()
    const title = d.title || d.name || ''
    const year = (d.release_date || d.first_air_date || '').split('-')[0]
    const imdbId = d.external_ids?.imdb_id || ''
    if (!title || !imdbId) return null
    return { title, year, imdbId }
  } catch {
    return null
  }
}

const LORDFLIX_HEADERS = {
  'Accept': '*/*',
  'Origin': 'https://lordflix.org',
  'Referer': 'https://lordflix.org/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
}

function encodeQuote(str: string): string {
  return encodeURIComponent(str).replace(/%20/g, '+').replace(/\+/g, '%20')
}

async function resolveLordflix(tmdb: string, type: string, season: string, episode: string): Promise<StreamResult[]> {
  try {
    const info = await tmdbLookup(tmdb, type)
    if (!info) return []
    const typeParam = type === 'tv' ? 'series' : 'movie'
    const titleEnc = encodeQuote(info.title)
    const servers = ['Berlin', 'Marseille', 'Phoenix', 'Oslo', 'Luna', 'Moscow']
    const results: StreamResult[] = []
    await Promise.all(servers.map(async (server) => {
      try {
        let serverUrl = `https://snowhouse.lordflix.club/?title=${titleEnc}&type=${typeParam}&year=${info.year || ''}`
          + `&imdb=${info.imdbId}&tmdb=${tmdb}&server=${server}`
        if (type === 'tv') serverUrl += `&season=${season}&episode=${episode}`
        const encRes = await fetch(`https://enc-dec.app/api/enc-lordflix?url=${encodeQuote(serverUrl)}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        })
        if (!encRes.ok) return
        const encJson: any = await encRes.json()
        if (!encJson || encJson.status !== 200 || !encJson.result) return
        const { url: proxyEncUrl, sign: signature } = encJson.result
        if (!proxyEncUrl || !signature) return
        const remoteRes = await fetch(proxyEncUrl, { headers: LORDFLIX_HEADERS })
        if (!remoteRes.ok) return
        const remoteText = await remoteRes.text()
        const decRes = await fetch('https://enc-dec.app/api/dec-lordflix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: remoteText, sign: signature }),
        })
        if (!decRes.ok) return
        const decJson: any = await decRes.json()
        const streamList = decJson?.result?.stream
        if (!Array.isArray(streamList) || streamList.length === 0) return
        const top = streamList[0]
        if (top?.type === 'hls' && top.playlist) {
          results.push({ name: `Lordflix ${server}`, stream: top.playlist, referer: 'https://lordflix.org/' })
        }
      } catch {
        // skip server
      }
    }))
    return results.slice(0, 2)
  } catch {
    return []
  }
}

const VIDEASY_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://player.videasy.net',
  'Referer': 'https://player.videasy.net/',
}

async function resolveVideasy(tmdb: string, type: string, season: string, episode: string): Promise<StreamResult[]> {
  try {
    const info = await tmdbLookup(tmdb, type)
    if (!info) return []
    const servers: [string, string][] = [
      ['Neon', 'https://api.videasy.net/myflixerzupcloud/sources-with-title'],
      ['Cypher', 'https://api.videasy.net/moviebox/sources-with-title'],
      ['Reyna', 'https://api.videasy.net/primewire/sources-with-title'],
      ['Ghost', 'https://api.videasy.net/primesrcme/sources-with-title'],
      ['Breach', 'https://api.videasy.net/m4uhd/sources-with-title'],
    ]
    const results: StreamResult[] = []
    await Promise.all(servers.map(async ([name, apiUrl]) => {
      try {
        let url = `${apiUrl}?title=${encodeURIComponent(info.title)}&mediaType=${type === 'tv' ? 'tv' : 'movie'}&year=${info.year}`
          + `&tmdbId=${tmdb}&imdbId=${info.imdbId || ''}`
        if (type === 'tv') url += `&seasonId=${season}&episodeId=${episode}`
        const encRes = await fetch(url, { headers: VIDEASY_HEADERS })
        if (!encRes.ok) return
        const text = await encRes.text()
        if (!text || text.length < 20 || text.startsWith('<')) return
        const decRes = await fetch('https://enc-dec.app/api/dec-videasy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, id: tmdb }),
        })
        if (!decRes.ok) return
        const decJson: any = await decRes.json()
        const resData = decJson?.result || decJson
        if (!resData || !Array.isArray(resData.sources)) return
        for (const s of resData.sources) {
          if (!s.url) continue
          results.push({ name: `Videasy ${name}${s.quality ? ' - ' + s.quality : ''}`, stream: s.url, referer: 'https://player.videasy.net/' })
        }
      } catch {
        // skip server
      }
    }))
    return results.slice(0, 2)
  } catch {
    return []
  }
}

const NOTORRENT_API = 'https://addon-osvh.onrender.com'

const MIN_MOVIE_BYTES = 30 * 1024 * 1024

async function isBigEnough(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!res.ok) return false
    const len = parseInt(res.headers.get('content-length') || '0', 10)
    if (!isFinite(len) || len <= 0) return true
    return len >= MIN_MOVIE_BYTES
  } catch {
    return false
  }
}

async function resolveNoTorrent(tmdb: string, type: string, season: string, episode: string): Promise<{ streams: StreamResult[]; clipsSkipped: number }> {
  try {
    const info = await tmdbLookup(tmdb, type)
    if (!info || !info.imdbId) return { streams: [], clipsSkipped: 0 }
    const path = type === 'tv'
      ? `series/${info.imdbId}:${season}:${episode}`
      : `movie/${info.imdbId}`
    const res = await fetch(`${NOTORRENT_API}/stream/${path}.json`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    if (!res.ok) return { streams: [], clipsSkipped: 0 }
    const data: any = await res.json()
    if (!Array.isArray(data?.streams)) return { streams: [], clipsSkipped: 0 }

    const usable = data.streams.filter((s: any) => s && typeof s.url === 'string'
      && !s.url.includes('vid1.php') && !s.url.includes('notorrent2.workers.dev')
      && !/^http:\/\/\d+\.\d+\.\d+\.\d+/i.test(s.url))

    const results: StreamResult[] = []
    for (const s of usable) {
      if (/\.m3u8(\?|$)/i.test(s.url)) {
        results.push({ name: `NoTorrent HLS - ${s.name || 'auto'}`, stream: s.url, referer: '' })
      }
    }
    let clipsSkipped = 0
    for (const s of usable) {
      if (/\.(mp4|mkv|webm)(\?|$)/i.test(s.url)) {
        if (await isBigEnough(s.url)) {
          results.push({ name: `NoTorrent VOD - ${s.name || 'direct'}`, stream: s.url, referer: '' })
        } else {
          clipsSkipped++
        }
      }
    }
    return { streams: results.slice(0, 3), clipsSkipped }
  } catch {
    return { streams: [], clipsSkipped: 0 }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/m3u8-proxy' || url.pathname === '/m3u8-proxy/') {
      return handleM3u8Proxy(request, url)
    }
    if (url.pathname === '/ts-proxy' || url.pathname === '/ts-proxy/') {
      return handleTsProxy(request, url)
    }

    const tmdb = url.searchParams.get('tmdb') || url.searchParams.get('id')
    const type = url.searchParams.get('type') || 'movie'
    const season = url.searchParams.get('s') || '1'
    const episode = url.searchParams.get('e') || '1'
    const debug = url.searchParams.get('debug') === '1'

    if (!tmdb) {
      return json({ error: 'Missing tmdb or id parameter' }, 400)
    }

    const trace: any = {}

    try {
      let sources: StreamResult[] = []

      const apiUrl = type === 'movie'
        ? `${BASE_URL}/api/movie/${tmdb}`
        : `${BASE_URL}/api/tv/${tmdb}/${season}/${episode}`

      const apiRes = await fetch(apiUrl, { headers: VIXSRC_HEADERS })
      trace.vixsrc_api = apiRes.status
      if (apiRes.status === 200) {
        const apiData: any = await apiRes.json()
        if (apiData && apiData.src) {
          const embedRes = await fetch(BASE_URL + apiData.src, {
            headers: { ...VIXSRC_HEADERS, Accept: 'text/html,application/xhtml+xml,*/*' },
          })
          trace.vixsrc_embed = embedRes.status
          const html = await embedRes.text()
          const tokenData = extractTokenData(html)
          trace.vixsrc_token = tokenData ? 'ok' : 'missing'
          if (tokenData) {
            const masterUrl = buildMasterUrl(tokenData)
            const m3u8Res = await fetch(masterUrl, {
              headers: { ...VIXSRC_HEADERS, Referer: apiUrl },
            })
            trace.vixsrc_m3u8 = m3u8Res.status
            trace.vixsrc_m3u8_ct = m3u8Res.headers.get('content-type')
            if (m3u8Res.status === 200) {
              const content = await m3u8Res.text()
              const probe = await probeDurationSeconds(content, masterUrl, apiUrl)
              trace.vixsrc_dur_s = Math.round(probe.seconds)
              if (probe.checked && probe.seconds < 120) {
                trace.vixsrc_error_reel = true
              } else {
                const { quality, subtitles } = parsePlaylist(content)
                trace.vixsrc_quality = quality
                sources.push({
                  name: `Vixsrc - ${quality}`,
                  stream: masterUrl,
                  referer: apiUrl,
                })
              }
            }
          }
        }
      }

      if (sources.length === 0) {
        const lf = await resolveLordflix(tmdb, type, season, episode)
        trace.lordflix = lf.length
        for (const s of lf) sources.push(s)
      }

      if (sources.length === 0) {
        const vs = await resolveVideasy(tmdb, type, season, episode)
        trace.videasy = vs.length
        for (const s of vs) sources.push(s)
      }

      if (sources.length === 0) {
        const nt = await resolveNoTorrent(tmdb, type, season, episode)
        trace.notorrent = nt.streams.length
        trace.notorrent_clips = nt.clipsSkipped
        trace.v2 = true
        for (const s of nt.streams) sources.push(s)
      }

      if (sources.length === 0) {
        return json({ error: 'No servers found', sources: [], trace: debug ? trace : undefined }, 404)
      }

      const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')
      const baseProxyUrl = `${proto}://${url.host}`
      const routed = sources.map(s => {
        const target = s.stream || ''
        const h = s.referer ? { Referer: s.referer } : {}
        if (/\.(mp4|mkv)(\?|$)/i.test(target)) {
          return { ...s, stream: `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(target)}&headers=${encodeURIComponent(JSON.stringify(h))}` }
        }
        return { ...s, stream: `${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(target)}&headers=${encodeURIComponent(JSON.stringify(h))}` }
      })

      return json({ sources: routed, trace: debug ? trace : undefined })
    } catch (err: any) {
      return json({ error: err.message || 'Internal error', trace: debug ? trace : undefined }, 500)
    }
  }
}
