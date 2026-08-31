import { useEffect, useRef, useState } from 'react'
import tudumUrl from '@/assets/flux-tudum.mp3'
import { withBase } from '@/lib/base-path'

const SESSION_KEY = 'flux-tudum-played'
const BOOM_AT = 0.72
const TOTAL_MS = 2300

export function LaunchSound() {
  const [show, setShow] = useState(false)
  const [phase, setPhase] = useState<'in' | 'boom' | 'out' | 'done'>('in')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const inApk = typeof (window as any).Flux?.onVideoPause === 'function'
    if (inApk || sessionStorage.getItem(SESSION_KEY)) return
    setShow(true)

    const audio = new Audio(tudumUrl)
    audioRef.current = audio
    audio.volume = 0.8

    let started = false
    const start = () => {
      if (started) return
      started = true
      try {
        audio.play().catch(() => {})
      } catch {}
      setTimeout(() => setPhase('boom'), BOOM_AT * 1000)
      setTimeout(() => setPhase('out'), 1700)
      setTimeout(() => {
        setPhase('done')
        setShow(false)
        sessionStorage.setItem(SESSION_KEY, '1')
      }, TOTAL_MS)
    }

    start()
    if (!started || audio.paused) {
      const onFirst = () => {
        start()
        window.removeEventListener('pointerdown', onFirst)
        window.removeEventListener('touchstart', onFirst)
      }
      window.addEventListener('pointerdown', onFirst, { once: true })
      window.addEventListener('touchstart', onFirst, { once: true })
    }

    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0D1117] overflow-hidden">
      <div className="absolute inset-0" aria-hidden>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vmin] h-[70vmin] rounded-full blur-[100px] splash-glow"
          style={{ background: 'radial-gradient(circle, hsl(348 83% 47% / 0.28), transparent 65%)' }} />
        <div className="absolute bottom-[12%] left-0 right-0 h-24 splash-beams" aria-hidden>
          <div className="splash-beam" />
          <div className="splash-beam" />
          <div className="splash-beam" />
        </div>
      </div>

      <div className={phase === 'in' ? 'splash-logo-in' : phase === 'boom' ? 'splash-logo-boom' : phase === 'out' ? 'splash-logo-out' : ''}>
        <img
          src={withBase('/logo.png')}
          alt="FLUX"
          draggable={false}
          className="w-[70vw] max-w-[520px] drop-shadow-[0_0_60px_hsl(348_83%_47%/0.5)]"
        />
      </div>
    </div>
  )
}
