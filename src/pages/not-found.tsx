import { Layout } from '@/components/layout'
import { Link } from 'wouter'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="relative mb-8">
          <h1 className="text-[12rem] font-display font-black leading-none text-white/5 select-none">404</h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl md:text-5xl font-bold font-display text-white drop-shadow-[0_0_20px_hsl(var(--primary)/0.8)]">Page introuvable</span>
          </div>
        </div>
        <p className="text-lg text-muted-foreground max-w-md mb-8">
          La page que vous cherchez n'existe pas ou a été déplacée.
        </p>
        <Link href="/" className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-full font-semibold transition-all hover:scale-105 shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
          <Home className="w-5 h-5" /><span>Retour à l'accueil</span>
        </Link>
      </div>
    </Layout>
  )
}
