import React, { useEffect, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

function reportError(msg: string) {
  try {
    fetch('/api/error-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg, ua: navigator.userAgent, at: new Date().toISOString() }),
    }).catch(() => {})
  } catch {
    // ignore
  }
}

export function useGlobalErrorReport() {
  const [fatal, setFatal] = useState<string | null>(null)

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      const msg = e.message || 'Erreur inconnue'
      reportError(`${msg} @ ${e.filename || ''}:${e.lineno || ''}`)
      setFatal(msg)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || String(e.reason || 'Rejet non géré')
      reportError(`[promise] ${msg}`)
      setFatal(msg)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return fatal
}

type ErrorBoundaryState = { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(`[boundary] ${error.message} — ${info.componentStack || ''}`.slice(0, 500))
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-md w-full bg-zinc-900/80 border border-red-500/40 rounded-2xl p-6 text-center">
            <p className="text-red-400 font-semibold text-sm mb-2">Erreur inattendue</p>
            <p className="text-white/70 text-xs mb-4 break-words">{String(this.state.error?.message || this.state.error)}</p>
            <button onClick={() => location.reload()}
              className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium">
              Recharger la page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export function ErrorBanner({ fatal }: { fatal: string | null }) {
  if (!fatal) return null
  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex justify-center p-3 pointer-events-none">
      <div className="bg-red-600/95 text-white text-[11px] px-3 py-1.5 rounded-full shadow-xl border border-red-400/40 max-w-[90vw] truncate">
        Erreur JS : {fatal}
      </div>
    </div>
  )
}
