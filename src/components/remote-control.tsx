import { useEffect, useState } from 'react'
import { AlertTriangle, Ban, RefreshCw, Skull, Power } from 'lucide-react'
import { withBase } from '@/lib/base-path'

type Notice = { title: string; message: string }
type BanState = { reason: string }

export function RemoteControl() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [ban, setBan] = useState<BanState | null>(null)

  useEffect(() => {
    const onRemote = (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      const { action, payload } = d || {}
      switch (action) {
        case 'pause':
          document.querySelectorAll('video').forEach(v => v.pause())
          break
        case 'play':
          document.querySelectorAll('video').forEach(v => {
            if (v.paused) {
              const p = v.play()
              p?.catch(() => {})
            }
          })
          break
        case 'redirect':
          window.location.assign((payload as any)?.url || '/')
          break
        case 'notice':
          setNotice({
            title: (payload as any)?.title || 'Erreur du flux',
            message: (payload as any)?.message || 'Le serveur a rencontré un problème. Veuillez réessayer.',
          })
          break
        case 'kick':
          setNotice({
            title: (payload as any)?.title || 'Déconnexion',
            message: (payload as any)?.message || 'Tu as été déconnecté. Recharge la page.',
          })
          setTimeout(() => window.location.assign('/'), 3200)
          break
        case 'ban':
          setBan({ reason: (payload as any)?.reason || '' })
          break
      }
    }
    window.addEventListener('flux-remote', onRemote)
    return () => window.removeEventListener('flux-remote', onRemote)
  }, [])

  return (
    <>
      {notice && (
        <div className="fixed inset-0 z-[120] bg-black/85 backdrop-blur-md flex items-center justify-center px-6">
          <div className="w-full max-w-sm rounded-2xl border border-red-500/25 bg-zinc-950/95 shadow-2xl shadow-red-500/10 p-6 md:p-8 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-5">
              <AlertTriangle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-1.5">{notice.title}</h2>
            <p className="text-sm text-white/55 leading-relaxed mb-6">{notice.message}</p>
            <button
              onClick={() => setNotice(null)}
              className="w-full rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Réessayer
            </button>
          </div>
        </div>
      )}

      {ban && (
        <div className="fixed inset-0 z-[130] bg-black flex flex-col items-center justify-center px-6 text-center overflow-hidden">
          <img src={withBase('/logo.png')} alt="FLUX" width={140} className="h-8 w-auto opacity-20 mb-10" />
          <div className="w-20 h-20 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center mb-6">
            <Ban className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">T’as été banni</h2>
          <p className="text-sm text-white/50 max-w-sm mb-3">
            Le boss t’a viré du flux.{ban.reason ? ` Motif : « ${ban.reason} »` : ''}
          </p>
          <p className="text-[11px] text-white/25 mb-8 flex items-center gap-1.5">
            <Skull className="w-3.5 h-3.5" /> Mauvais choix… vraiment mauvais choix.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm font-semibold px-6 py-2.5 flex items-center gap-2 transition-colors"
          >
            <Power className="w-4 h-4" /> J’avais rien fait…
          </button>
        </div>
      )}
    </>
  )
}
