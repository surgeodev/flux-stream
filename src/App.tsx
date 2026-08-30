import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary, ErrorBanner, useGlobalErrorReport } from '@/components/error-guard'
import NotFound from '@/pages/not-found'
import Home from '@/pages/home'
import SearchPage from '@/pages/search'
import PlaylistPage from '@/pages/playlist'
import AccountPage from '@/pages/account'
import Categories from '@/pages/categories'
import CategoryPage from '@/pages/category/[id]'
import MoviePage from '@/pages/movie/[id]'
import TVPage from '@/pages/tv/[id]'
import Watch from '@/pages/watch'
import Admin from '@/pages/admin'
import { PresenceReporter } from '@/hooks/use-presence'
import { RemoteControl } from '@/components/remote-control'
import { Route, Switch, Router as WouterRouter } from 'wouter'
import { Toaster } from '@/components/ui/toaster'
import { ToastProvider } from '@/components/ui/use-toast'
import { LaunchSound } from '@/components/launch-sound'
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
      <Route path="/playlist" component={PlaylistPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/categories" component={Categories} />
      <Route path="/category/:id" component={CategoryPage} />
      <Route path="/movie/:id" component={MoviePage} />
      <Route path="/tv/:id" component={TVPage} />
      <Route path="/watch" component={Watch} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  )
}

function App() {
  const fatal = useGlobalErrorReport()
  return (
    <ErrorBoundary>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={BASE_PATH}>
              <Router />
            </WouterRouter>
            <PresenceReporter />
          </TooltipProvider>
        </QueryClientProvider>
        <ErrorBanner fatal={fatal} />
        <LaunchSound />
        <RemoteControl />
        <Toaster />
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App
