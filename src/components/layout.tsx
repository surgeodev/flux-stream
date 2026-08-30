import { Navbar } from './navbar'
import { motion } from 'framer-motion'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30">
      <Navbar />
      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex-1 flex flex-col"
      >
        {children}
      </motion.main>
      <footer className="border-t border-white/5 py-10 mt-12">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-xs">
          <p className="font-display font-medium text-white/40 mb-3 tracking-[0.4em] text-[11px]">FLUX</p>
          <p>&copy; {new Date().getFullYear()} — Streaming sans pub</p>
        </div>
      </footer>
    </div>
  )
}
