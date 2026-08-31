import { useMemo } from 'react'
import { AvatarCircle } from '@/components/profile-picker'
import type { RoomMember, RoomReaction } from '@/hooks/use-room'

export const REACT_EMOJIS = ['🔥', '❤️', '😂', '😮', '👍', '🍿', '😴', '🎬']

export function RoomOverlay({
  members,
  leaderUid,
  selfUid,
  reactions,
  react,
}: {
  members: RoomMember[]
  leaderUid: string | null
  selfUid: string | null
  reactions: RoomReaction[]
  react: (emoji: string) => void
}) {
  const others = useMemo(() => members.filter(m => m.uid !== selfUid), [members, selfUid])

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Haubuis: bulles de réactions montantes */}
      <div className="absolute bottom-40 inset-x-0 flex justify-center pointer-events-none" aria-hidden>
        {reactions.slice(-8).map(r => (
          <span
            key={r.id}
            className="absolute text-3xl md:text-4xl animate-room-react drop-shadow-lg"
            style={{ animation: 'room-react-rise 4s ease-out forwards', left: `${20 + (r.ts % 60)}%` }}
            title={r.from?.name || ''}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Avatars des membres (cornier bas-gauche) */}
      {others.length > 0 && (
        <div className="absolute bottom-14 left-3 flex items-center gap-1.5">
          <div className="flex -space-x-2">
            {others.slice(0, 8).map(m => (
              <span key={m.uid} className="relative inline-block" title={m.name}>
                <AvatarCircle name={m.name} avatar={m.avatar} size="sm" />
                {m.uid === leaderUid && (
                  <span className="absolute -top-1 -right-1 text-[8px]">👑</span>
                )}
              </span>
            ))}
          </div>
          <span className="text-[11px] text-white/80 bg-black/50 backdrop-blur rounded-full px-2 py-0.5">
            {members.length} en salle
          </span>
        </div>
      )}

      {/* Barre de réactions (visible si salle active) */}
      {members.length > 1 && (
        <div className="absolute bottom-14 right-3 flex items-center gap-1 bg-black/40 backdrop-blur-md rounded-full px-2 py-1.5 border border-white/10 pointer-events-auto">
          {REACT_EMOJIS.slice(0, 6).map(e => (
            <button
              key={e}
              onClick={() => react(e)}
              className="w-8 h-8 rounded-full hover:bg-white/15 active:scale-90 transition-all text-lg flex items-center justify-center"
              title={`Réaction ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}