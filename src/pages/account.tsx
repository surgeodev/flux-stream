import { Layout } from '@/components/layout'
import { Link } from 'wouter'
import { User, Camera, Heart, Play, Check, Loader2 } from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useProfile, uploadAvatar, type Profile } from '@/hooks/use-profile'
import { AvatarCircle } from '@/components/profile-picker'
import { type MediaItem } from '@/hooks/use-tmdb'
import { MediaCard } from '@/components/media-card'

function PhotoEditor({ profile, onUpdated }: { profile: Profile; onUpdated: (p: Profile) => void }) {
  const { save: saveProfile } = useProfile()
  const [saving, setSaving] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(profile?.name || '')

  useEffect(() => {
    setName(profile?.name || '')
  }, [profile?.name])

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('Choisis une image (JPG, PNG, WEBP)'); return }
    if (file.size > 10 * 1024 * 1024) { setErr('Image trop lourde (max 10 Mo)'); return }
    setErr('')
    setSaving(true)
    try {
      const res = await uploadAvatar(file)
      if (res?.avatar) setPhoto(res.avatar)
      else setErr('Impossible d\'envoyer la photo')
    } finally {
      setSaving(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    if (!name.trim()) { setErr('Choisis un nom'); return }
    setErr('')
    const ok = await saveProfile(name, photo || profile?.avatar || '')
    if (ok) onUpdated({ ...profile, name: name.trim(), avatar: photo || profile?.avatar || '' } as Profile)
    else setErr('Impossible d\'enregistrer')
  }

  const imgSrc = photo || profile?.avatar

  return (
    <div className="flex flex-col items-center md:items-start md:flex-row gap-6 md:gap-8">
      {/* Photo */}
      <div className="flex flex-col items-center gap-3 shrink-0">
        <div className="relative">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl overflow-hidden border-2 border-white/15 bg-white/5 shadow-2xl shadow-black/50">
            {imgSrc ? (
              <img src={imgSrc} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <AvatarCircle name={name || '?'} size="lg" />
              </div>
            )}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={saving}
            title="Changer la photo"
            className="absolute bottom-2 right-2 w-10 h-10 rounded-xl bg-primary hover:bg-primary/90 text-white flex items-center justify-center shadow-lg border-2 border-zinc-900 transition-all active:scale-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
        <button onClick={() => fileRef.current?.click()} className="text-xs text-white/40 hover:text-white transition-colors">
          Changer la photo
        </button>
      </div>

      {/* Name + save */}
      <div className="flex-1 w-full max-w-sm">
        <label className="block text-xs font-medium text-white/50 mb-1.5">Ton nom</label>
        <input
          value={name}
          onChange={e => setName(e.target.value.slice(0, 24))}
          maxLength={24}
          placeholder="Ex: Alex"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50"
        />
        <p className="text-[11px] text-white/35 mt-2">Ce profil est lié à ton appareil — aucun mot de passe nécessaire.</p>
        {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="mt-4 flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold px-7 py-2.5 rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_25px_hsl(var(--primary)/0.35)]"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Enregistrer
        </button>
      </div>
    </div>
  )
}

export default function AccountPage() {
  const { profile, loading } = useProfile()
  const [likes, setLikes] = useState<MediaItem[]>([])
  const [refreshed, setRefreshed] = useState(0)

  const refreshLikes = useCallback(() => {
    const cur = profile?.likes || []
    setLikes(cur.map(l => ({
      id: l.id, type: l.type, title: l.title, img: l.img || '', rating: 0, year: 0, overview: '', backdrop: '',
    })))
  }, [profile?.likes])

  useEffect(() => {
    refreshLikes()
  }, [refreshLikes, refreshed])

  useEffect(() => {
    const onLike = () => setRefreshed(x => x + 1)
    window.addEventListener('flux-likes-changed', onLike)
    return () => window.removeEventListener('flux-likes-changed', onLike)
  }, [])

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 md:px-6 pt-28 pb-16 flex justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      </Layout>
    )
  }

  if (!profile?.name) {
    return (
      <Layout>
        <div className="container mx-auto px-4 md:px-6 pt-24 md:pt-32 pb-16 max-w-xl">
          <div className="flex items-center gap-3 mb-8">
            <span className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-white shadow-[0_4px_20px_hsl(var(--primary)/0.4)]">
              <User className="w-5 h-5 md:w-6 md:h-6" />
            </span>
            <div>
              <h1 className="text-2xl md:text-4xl font-black font-display text-white">Ton compte</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Crée ton profil en 10 secondes</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
            <PhotoEditor profile={{ name: '', avatar: '' } as Profile} onUpdated={() => setRefreshed(x => x + 1)} />
          </div>

          <div className="mt-8 flex flex-col items-center text-center">
            <Heart className="w-9 h-9 text-white/20 mb-3" />
            <p className="text-sm text-muted-foreground max-w-sm">
              Ensuite, aime tes films et séries : ils apparaîtront ici et tes amis verront que tu les aimes.
            </p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-6 pt-24 md:pt-32 pb-16">
        <div className="flex items-center gap-3 mb-8">
          <span className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary to-orange-500 flex items-center justify-center text-white shadow-[0_4px_20px_hsl(var(--primary)/0.4)]">
            <User className="w-5 h-5 md:w-6 md:h-6" />
          </span>
          <div>
            <h1 className="text-2xl md:text-4xl font-black font-display text-white">Ton compte</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Profil lié à ton appareil · {profile.name}</p>
          </div>
        </div>

        {/* Profile card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 mb-12">
          <PhotoEditor profile={profile} onUpdated={() => setRefreshed(x => x + 1)} />
        </div>

        {/* Favorites */}
        <div className="flex items-center gap-3 mb-5">
          <Heart className="w-5 h-5 text-primary" />
          <h2 className="text-lg md:text-2xl font-bold font-display text-white">Mes favoris</h2>
          <span className="text-xs font-semibold text-muted-foreground">{likes.length} titre{likes.length > 1 ? 's' : ''}</span>
        </div>

        {likes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-4 rounded-2xl border border-dashed border-white/10">
            <Heart className="w-10 h-10 text-white/15 mb-4" />
            <h3 className="text-lg font-bold font-display text-white mb-2">Aucun favori pour l'instant</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              Touche le cœur « J'aime » sur une fiche de film ou de série pour la retrouver ici.
            </p>
            <Link href="/" className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-7 py-3 rounded-xl font-bold transition-all hover:scale-105 shadow-[0_0_25px_hsl(var(--primary)/0.4)]">
              <Play className="w-4 h-4 fill-current" /> Découvrir le catalogue
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
            {likes.map(item => (
              <MediaCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}