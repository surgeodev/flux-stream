import { useState, useCallback } from 'react'
import { getIframeSources, rewriteLocalUrl, type StreamSource } from './use-tmdb'

export function useStream() {
  const [sources, setSources] = useState<StreamSource[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = sources[activeIdx]
  const iframeUrl = active?.kind === 'iframe' ? active.iframeUrl : null
  const hlsUrl = active?.kind === 'hls' ? active.hlsUrl : null
  const sourceName = active?.name || ''

  const fetchStream = useCallback(async (
    type: string,
    id: string | number,
    season?: number,
    episode?: number,
  ) => {
    setLoading(true)
    setError(null)
    setSources([])
    setActiveIdx(0)

    try {
      const all = await getIframeSources(Number(id), type, season, episode)
      const built: StreamSource[] = []

      // 1) Éclater l'agrégat, ordonner par qualité DESC (1080p d'abord),
      //    puis Vixsrc en priorité à qualité égale.
      const flux = all.find(s => s.kind === 'hls')
      if (flux) {
        let list: any[] = []
        try {
          const res = await fetch(flux.hlsUrl, { signal: AbortSignal.timeout(40000) })
          if (res.ok) {
            const data: any = await res.json()
            list = data?.streams ?? data?.sources ?? []
          }
        } catch {}
        if (list.length > 0) {
          const scored = list.map(st => {
            const url = st?.url || st?.stream || ''
            const prov = (st?.provider || '').toLowerCase()
            const qual = (st?.quality || '').toLowerCase()
            let qscore = 0
            if (qual.includes('2160') || qual.includes('4k')) qscore = 4
            else if (qual.includes('1080')) qscore = 3
            else if (qual.includes('720')) qscore = 2
            else if (url.includes('/1080/') || url.includes('1080')) qscore = 3
            else if (url.includes('/720/') || url.includes('720')) qscore = 2
            const isVix = prov.includes('vixsrc')
            // Vixsrc is the most reliable provider (tokens refresh, real HLS).
            // Boost it so it's always tried first, regardless of nominal quality —
            // broken 2160p sources currently cause repeated errors before failover.
            if (isVix) qscore += 2
            return { st, qscore, isVix, url, prov, qual }
          })
          scored.sort((a, b) => {
            if (b.qscore !== a.qscore) return b.qscore - a.qscore
            if (a.isVix && !b.isVix) return -1
            if (!a.isVix && b.isVix) return 1
            return 0
          })
          for (const { st, url, prov, qual } of scored) {
            if (!url) continue
            const p = prov ? ` · ${st.provider}` : ''
            const q = qual ? ` ${st.quality}` : ''
            built.push({ kind: 'hls', name: `Vixsrc${p}${q}`, hlsUrl: rewriteLocalUrl(url) })
          }
        } else {
          built.push(flux)
        }
      }

      // 2) Sources iframe en dernier recours
      for (const s of all) {
        if (s.kind === 'iframe') built.push(s)
      }

      if (built.length === 0) {
        setError('Aucun flux trouvé')
        return
      }
      setSources(built)
    } catch (err: any) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const switchSource = useCallback((idx: number) => {
    if (idx >= 0 && idx < sources.length) setActiveIdx(idx)
  }, [sources.length])

  return { iframeUrl, hlsUrl, sourceName, sources, activeIdx, loading, error, fetchStream, switchSource }
}
