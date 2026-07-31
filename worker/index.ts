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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const tmdb = url.searchParams.get('tmdb') || url.searchParams.get('id')
    const type = url.searchParams.get('type') || 'movie'
    const season = url.searchParams.get('s') || '1'
    const episode = url.searchParams.get('e') || '1'

    if (!tmdb) {
      return json({ error: 'Missing tmdb or id parameter' }, 400)
    }

    try {
      let sources = await resolveVixsrc(tmdb, type, season, episode)

      if (sources.length === 0) {
        sources = await resolveVidlink(tmdb, type, season, episode)
      }

      if (sources.length === 0) {
        return json({ error: 'No servers found', sources: [] }, 404)
      }

      return json({ sources })
    } catch (err: any) {
      return json({ error: err.message || 'Internal error' }, 500)
    }
  }
}
