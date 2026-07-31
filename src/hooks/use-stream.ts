import { useState, useCallback } from 'react'
import { getIframeSources, type StreamSource } from './use-tmdb'

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
      const all = getIframeSources(Number(id), type, season, episode)
      if (all.length === 0) {
        setError('Aucun flux trouvé')
        return
      }
      setSources(all)
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
