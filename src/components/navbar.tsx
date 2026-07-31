import { Link, useLocation } from 'wouter'
import { Search } from 'lucide-react'
import { useState } from 'react'

export function Navbar() {
  const [, setLocation] = useLocation()
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      setLocation(`/search?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5 py-2 md:py-3">
      <div className="container mx-auto px-3 md:px-6 flex items-center justify-between gap-2 md:gap-4">
        <Link href="/" className="flex items-center gap-2 z-10 shrink-0">
          <img src="/logo.png" alt="FLUX" width={120} height={28} className="h-6 md:h-7 w-auto" />
        </Link>

        <div className="flex-1 max-w-xl">
          <form onSubmit={handleSearch} className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="Chercher..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-full py-1.5 md:py-2 pl-9 pr-4 text-xs md:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:bg-white/10 transition-all"
            />
          </form>
        </div>
      </div>
    </header>
  )
}
