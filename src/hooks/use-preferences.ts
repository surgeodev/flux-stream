import { useLocalStorage } from './use-local-storage'

export type Preferences = {
  proxyUrl: string
}

export function usePreferences() {
  const [preferences, setPreferences] = useLocalStorage<Preferences>('stream_preferences', {
    proxyUrl: ''
  })

  const updatePreferences = (prefs: Partial<Preferences>) => {
    setPreferences(p => ({ ...p, ...prefs }))
  }

  return { preferences, updatePreferences }
}
