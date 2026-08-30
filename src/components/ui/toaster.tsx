import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { useToast } from './use-toast'
import { cn } from '@/lib/utils'

const ACCENTS: Record<string, string> = {
  default: 'bg-primary',
  success: 'bg-emerald-500',
  error: 'bg-red-500',
}

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-4 inset-x-0 z-[9999] flex flex-col items-center gap-2 px-4 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map(t => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 flex items-center gap-3 pl-4 pr-10 py-3"
          >
            <span className={cn('absolute inset-y-0 left-0 w-1', ACCENTS[t.variant])} />
            {t.variant === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            {t.variant === 'error' && <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />}
            <div className="min-w-0">
              {t.title && <p className="text-sm font-semibold text-white leading-tight">{t.title}</p>}
              {t.description && <p className="text-xs text-white/55 mt-0.5 leading-snug">{t.description}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="absolute top-2.5 right-2.5 text-white/30 hover:text-white transition-colors"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
