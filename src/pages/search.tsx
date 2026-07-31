import { Layout } from '@/components/layout'
import { useSearch } from 'wouter'
import { Search as SearchIcon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { MediaCard } from '@/components/media-card'
import { searchMedia, type MediaItem } from '@/hooks/use-tmdb'

export default function SearchPage() {
  const searchString = useSearch()
  const queryParams = new URLSearchParams(searchString)
  const q = queryParams.get('q') || ''

  const [results, setResults] = useState<MediaItem[]>([])

  useEffect(() => {
    if (q) {
      searchMedia(q).then(setResults)
    } else {
      setResults([])
    }
  }, [q])

  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-6 py-24 md:py-32 flex flex-col min-h-screen">
        {q ? (
          <>
            <div className="mb-6 flex items-center justify-between animate-in fade-in duration-500">
              <h2 className="text-xl text-muted-foreground">
                Résultats pour <span className="text-white font-semibold">&ldquo;{q}&rdquo;</span>
              </h2>
              <span className="text-sm bg-white/10 px-3 py-1 rounded-full">{results.length} résultats</span>
            </div>
            <div className="flex-1">
              {results.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6 animate-in fade-in duration-500 delay-200">
                  {results.map(item => <MediaCard key={`${item.type}-${item.id}`} item={item} />)}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in">
                  <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                    <SearchIcon className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-2xl font-semibold font-display mb-2">Aucun résultat</h3>
                  <p className="text-muted-foreground max-w-md">
                    Nous n'avons pas trouvé de résultat pour &ldquo;{q}&rdquo;. Essayez d'autres mots-clés.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
              <SearchIcon className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold font-display mb-2">Recherche</h2>
            <p className="text-muted-foreground">Utilisez la barre de recherche en haut pour trouver un film ou une série.</p>
          </div>
        )}
      </div>
    </Layout>
  )
}
