import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import NotFound from '@/pages/not-found'
import Home from '@/pages/home'
import SearchPage from '@/pages/search'
import MoviePage from '@/pages/movie/[id]'
import TVPage from '@/pages/tv/[id]'
import Watch from '@/pages/watch'
import { Route, Switch, Router as WouterRouter } from 'wouter'
import { Toaster } from '@/components/ui/toaster'
import { BASE_PATH } from '@/lib/base-path'

const queryClient = new QueryClient()

const redirect = sessionStorage.getItem('flux-redirect')
if (redirect) {
  sessionStorage.removeItem('flux-redirect')
  const target = `${BASE_PATH}${redirect}`
  if (window.location.pathname + window.location.search !== target) {
    window.history.replaceState(null, '', target)
  }
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/search" component={SearchPage} />
      <Route path="/movie/:id" component={MoviePage} />
      <Route path="/tv/:id" component={TVPage} />
      <Route path="/watch" component={Watch} />
      <Route component={NotFound} />
    </Switch>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={BASE_PATH}>
          <Router />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
