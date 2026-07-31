import { useRef, useEffect, useState } from 'react'
import Hls from 'hls.js'

type HLSPlayerProps = {
  src: string
  poster?: string
  className?: string
  onError?: () => void
  onPlaying?: () => void
}

export default function HLSPlayer({ src, poster, className, onError, onPlaying }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    setError('')
    hlsRef.current?.destroy()
    hlsRef.current = null

    const timeout = setTimeout(() => {
      setError('Délai d\'attente dépassé (15s)')
    }, 15000)
    timerRef.current = timeout

    if (Hls.isSupported()) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError('Erreur de chargement du flux')
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
    } else {
      setError('HLS non supporté')
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
      video.src = ''
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [src])

  useEffect(() => {
    if (error) {
      hlsRef.current?.destroy()
      hlsRef.current = null
      onError?.()
    }
  }, [error])

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-black text-muted-foreground ${className}`}>
        <div className="text-center px-4">
          <p className="text-sm text-muted-foreground/60">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      className={className}
      poster={poster}
      controls
      autoPlay
      playsInline
      onPlaying={() => {
        if (timerRef.current) clearTimeout(timerRef.current)
        onPlaying?.()
      }}
    />
  )
}
