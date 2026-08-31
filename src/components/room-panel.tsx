import { useEffect, useRef, useState } from 'react'
import { Users, X, Send, UserPlus, Ban, BellRing, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AvatarCircle } from '@/components/profile-picker'
import type { Profile } from '@/hooks/use-profile'
import type { RoomChatMsg, RoomInfo, OnlineUser, JoinRequest } from '@/hooks/use-room'
import { ROOM_MAX } from '@/hooks/use-room'

export type RoomApi = {
  connected: boolean
  room: RoomInfo | null
  selfUid: string | null
  error: string
  chats: RoomChatMsg[]
  onlineUsers: OnlineUser[]
  joinRequest: JoinRequest | null
  create: (p: { uid?: string; name?: string; avatar?: string }) => void
  leave: () => void
  sendChat: (text: string) => void
  react: (emoji: string) => void
  requestJoin: (targetUid: string, p: { uid?: string; name?: string; avatar?: string }) => void
  respondJoin: (targetUid: string, action: 'accept' | 'reject' | 'mute') => void
  setProfile: (p: { uid?: string; name?: string; avatar?: string }) => void
}

const REACT_EMOJIS = ['🔥', '❤️', '😂', '😮', '👍', '🍿', '😴', '🎬']

export function RoomPanel({ roomApi, profile }: { roomApi: RoomApi; profile: Profile | null | undefined }) {
  const { room, connected, selfUid, error, chats, onlineUsers, joinRequest } = roomApi
  const [msg, setMsg] = useState('')
  const [requesting, setRequesting] = useState<string | null>(null)
  const chatBoxRef = useRef<HTMLDivElement>(null)
  const profileRef = { uid: profile?.uid, name: profile?.name, avatar: profile?.avatar }

  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight
  }, [chats])

  useEffect(() => {
    if (profile?.uid) roomApi.setProfile(profileRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, profile?.name, profile?.avatar])

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault()
    if (!msg.trim()) return
    roomApi.sendChat(msg.trim())
    setMsg('')
  }

  const askToJoin = async (targetUid: string) => {
    setRequesting(targetUid)
    roomApi.requestJoin(targetUid, profileRef)
    setTimeout(() => setRequesting(null), 1500)
  }

  if (!room) {
    return (
      <div className="p-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-primary" /> Regarder à deux
        </h3>
        {!profile?.name && (
          <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-3">
            Crée d'abord ton profil (avatar en haut à droite) pour inviter tes amis.
          </p>
        )}
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <button
          onClick={() => roomApi.create(profileRef)}
          disabled={!profile?.name}
          className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-40 text-sm mb-4"
        >
          <UserPlus className="w-4 h-4" /> Créer ma room
        </button>

        <p className="text-[11px] text-white/40 mb-3 flex items-center gap-1.5">
          <BellRing className="w-3.5 h-3.5" /> Qui est en ligne : demande-lui à regarder avec lui
        </p>

        {!connected && (
          <p className="text-xs text-white/45 text-center py-4">Connexion au serveur…</p>
        )}
        {connected && onlineUsers.length === 0 && (
          <p className="text-xs text-white/35 text-center py-4">
            Personne en ligne pour l'instant.
          </p>
        )}
        {profile?.name && connected && (
          <ul className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {onlineUsers.map(u => (
              <li key={u.uid} className="flex items-center gap-2.5 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2">
                <AvatarCircle name={u.name} avatar={u.avatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-white truncate block leading-tight">{u.name}</span>
                  <span className={cn('text-[10px]', u.inRoom ? 'text-emerald-400/80' : 'text-white/30')}>
                    {u.inRoom ? 'En salle · peut être rejoint' : 'En ligne'}
                  </span>
                </div>
                <button
                  onClick={() => askToJoin(u.uid)}
                  disabled={requesting === u.uid}
                  className={cn(
                    'flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50',
                    u.inRoom
                      ? 'bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25'
                      : 'bg-white/5 text-white/40 border border-white/10'
                  )}
                >
                  {requesting === u.uid ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                  {u.inRoom ? 'Rejoindre' : '—'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const isFull = (room?.members.length ?? 0) >= ROOM_MAX
  const leaderUid = room.leaderUid
  const leaderName = room.members.find(m => m.uid === leaderUid)?.name || ''
  const isLeader = selfUid === leaderUid

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-red-500')} />
        <h3 className="text-sm font-bold text-white flex-1">Room · {room.members.length}/{ROOM_MAX}</h3>
        <button onClick={() => roomApi.leave()} className="flex items-center gap-1 text-[11px] text-red-300/80 hover:text-red-300 bg-red-500/10 rounded-lg px-2 py-1 transition-colors">
          <X className="w-3 h-3" /> Quitter
        </button>
      </div>

      <div className="flex items-center justify-center flex-wrap gap-4 py-2">
        {room.members.map(m => (
          <div key={m.uid} className="flex flex-col items-center gap-1.5">
            <div className="relative">
              <AvatarCircle name={m.name} avatar={m.avatar} size="lg" />
              {m.uid === room.leaderUid && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-white flex items-center justify-center">P</span>}
              {m.uid === selfUid && <span className="absolute -bottom-1 -left-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-zinc-900" />}
            </div>
            <span className="text-[11px] text-white/70 font-medium">{m.name}{m.uid === selfUid ? ' (toi)' : ''}</span>
          </div>
        ))}
        {!isFull && (
          <div className="flex items-center text-[10px] text-white/30 gap-1">
            <UserPlus className="w-3 h-3" /> Invite tes amis
          </div>
        )}
      </div>

      {/* réactions rapides */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {REACT_EMOJIS.map(e => (
          <button
            key={e}
            onClick={() => roomApi.react(e)}
            className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 text-base hover:bg-white/[0.14] hover:scale-110 active:scale-90 transition-all"
            title={`Réaction ${e}`}
          >
            {e}
          </button>
        ))}
      </div>

      {joinRequest && isLeader && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
          <div className="flex items-center gap-2.5 mb-2">
            <AvatarCircle name={joinRequest.name} avatar={joinRequest.avatar} size="sm" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-bold text-white block">{joinRequest.name}</span>
              <span className="text-[10px] text-primary">veut rejoindre ta room</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => roomApi.respondJoin(joinRequest.uid, 'accept')}
              className="flex-1 flex items-center justify-center gap-1 bg-primary hover:bg-primary/90 text-white text-xs font-bold py-2 rounded-lg transition-all active:scale-95"
            >
              <UserPlus className="w-3.5 h-3.5" /> Accepter
            </button>
            <button
              onClick={() => roomApi.respondJoin(joinRequest.uid, 'reject')}
              className="flex-1 flex items-center justify-center gap-1 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold py-2 rounded-lg transition-all active:scale-95"
            >
              <X className="w-3.5 h-3.5" /> Refuser
            </button>
            <button
              onClick={() => roomApi.respondJoin(joinRequest.uid, 'mute')}
              title="Mettre en sourdine (bloquer ses demandes)"
              className="flex items-center justify-center gap-1 bg-white/[0.06] hover:bg-red-500/20 text-white/60 hover:text-red-300 text-xs font-semibold px-2.5 py-2 rounded-lg transition-all"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-white/40 text-center">
        {isLeader
          ? 'Tu pilotes — tes actions play/pause/seek sont répercutées'
          : `Tu suis ${leaderName} — lecture synchronisée`}
      </p>

      <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
        <div ref={chatBoxRef} className="h-36 overflow-y-auto p-3 space-y-2 scrollbar-thin">
          {chats.length === 0 && <p className="text-[11px] text-white/30 text-center mt-4">Discute avec ton pote…</p>}
          {chats.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <AvatarCircle name={c.from.name} avatar={c.from.avatar} size="sm" />
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-primary block leading-tight">{c.from.name}</span>
                <span className="text-xs text-white/85 break-words leading-snug">{c.text}</span>
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={sendChat} className="flex items-center gap-2 p-2 border-t border-white/10">
          <input
            value={msg}
            onChange={e => setMsg(e.target.value)}
            placeholder="Message..."
            className="flex-1 min-w-0 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50"
          />
          <button type="submit" disabled={!msg.trim()} className="text-primary hover:text-primary/80 disabled:opacity-30 transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}