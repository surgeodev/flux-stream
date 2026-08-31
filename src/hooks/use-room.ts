import { useCallback, useEffect, useRef, useState } from 'react'

export type RoomMember = { uid: string; name: string; avatar: string }
export type RoomChatMsg = { from: { uid: string; name: string; avatar: string }; text: string; ts: number }
export type OnlineUser = { uid: string; name: string; avatar: string; inRoom: boolean }
export type JoinRequest = { uid: string; name: string; avatar: string }
export type RoomReaction = { id: string; from: { uid: string; name: string; avatar: string }; emoji: string; ts: number; mine?: boolean }

export const ROOM_MAX = 10

export type RoomInfo = {
  code: string
  members: RoomMember[]
  leaderUid: string | null
  state: { playing: boolean; time: number; media: RoomMedia | null }
}
export type RoomMedia = { url: string; mediaType: string; id: number; s?: number; e?: number }

type ProfileId = { uid?: string; name?: string; avatar?: string }

export function roomWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname || 'localhost'
  return `${proto}//${host}:8787/room`
}

export function useRoom(autoJoinCode?: string | null) {
  const [connected, setConnected] = useState(false)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [selfUid, setSelfUid] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [chats, setChats] = useState<RoomChatMsg[]>([])
  const [reactions, setReactions] = useState<RoomReaction[]>([])
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [joinRequest, setJoinRequest] = useState<JoinRequest | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const roomRef = useRef<RoomInfo | null>(null)
  const selfUidRef = useRef<string | null>(null)
  const onMediaRef = useRef<(m: RoomMedia) => void>(() => {})
  const roomCommandRef = useRef<((cmd: { playing: boolean; time: number }) => void) | null>(null)
  const autoJoinRef = useRef<(() => void) | null>(null)

  const setExp = useCallback((updater: (r: RoomInfo | null) => RoomInfo | null) => {
    roomRef.current = updater(roomRef.current)
    setRoom(roomRef.current)
  }, [])

  const handleMsg = useCallback((raw: string) => {
    let m: any
    try { m = JSON.parse(raw) } catch { return }
    switch (m.type) {
      case 'joined':
        roomRef.current = m.room
        selfUidRef.current = m.selfUid
        setRoom(m.room)
        setSelfUid(m.selfUid)
        setJoinRequest(null)
        setError('')
        break
      case 'peer-joined': {
        const cur = roomRef.current
        if (cur && !cur.members.some(x => x.uid === m.member.uid)) {
          setExp(r => r ? { ...r, members: [...r.members, m.member] } : r)
        }
        break
      }
      case 'peer-left':
        setExp(r => r ? { ...r, members: r.members.filter(x => x.uid !== m.uid) } : r)
        break
      case 'leader':
        setExp(r => r ? { ...r, leaderUid: m.leaderUid || null } : r)
        break
      case 'chat': {
        const cm: RoomChatMsg = { from: m.from, text: String(m.text).slice(0, 400), ts: m.ts }
        setChats(prev => [...prev.slice(-80), cm])
        break
      }
      case 'react': {
        const id = `${m.ts}-${m.from?.uid}-${Math.random().toString(36).slice(2, 7)}`
        const r: RoomReaction = { id, from: { uid: m.from?.uid || '', name: m.from?.name || '?', avatar: m.from?.avatar || '' }, emoji: String(m.emoji || ''), ts: m.ts, mine: Boolean(m.mine) }
        setReactions(prev => [...prev.slice(-30), r])
        // auto-retrait après 4.5s (bulle qui s'éteint)
        setTimeout(() => setReactions(prev => prev.filter(x => x.id !== id)), 4500)
        break
      }
      case 'play':
      case 'pause':
      case 'seek':
        if (selfUidRef.current && roomRef.current && roomRef.current.leaderUid !== selfUidRef.current) {
          roomCommandRef.current?.({ playing: m.type === 'play', time: Number(m.time) || 0 })
        }
        break
      case 'time':
        if (selfUidRef.current && roomRef.current && roomRef.current.leaderUid !== selfUidRef.current) {
          roomCommandRef.current?.({ playing: Boolean(m.playing), time: Number(m.time) || 0 })
        }
        break
      case 'media':
        if (selfUidRef.current && roomRef.current && roomRef.current.leaderUid !== selfUidRef.current) {
          onMediaRef.current(m.media)
        }
        break
      case 'online-users':
        setOnlineUsers((m.users || []).filter((u: OnlineUser) => u.uid !== selfUidRef.current))
        break
      case 'hello-ok':
        selfUidRef.current = m.selfUid
        setSelfUid(m.selfUid)
        break
      case 'join-request':
        setJoinRequest({ uid: m.from.uid, name: m.from.name, avatar: m.from.avatar })
        break
      case 'request-sent':
        setError('')
        break
      case 'request-result':
        setError(
          m.status === 'muted' ? 'Tu as été mis en sourdine par ce profil'
            : m.status === 'full' ? 'Cette room est pleine'
            : m.status === 'rejected' ? 'Demande refusée'
            : m.status === 'offline' ? 'Ce profil n\'est plus en ligne'
            : m.status === 'pending' ? 'Demande déjà envoyée'
            : ''
        )
        break
    }
  }, [setExp])

  const connect = useCallback((code?: string) => {
    setError('')
    wsRef.current?.close()
    const ws = new WebSocket(roomWsUrl())
    wsRef.current = ws
    ws.onopen = () => {
      setConnected(true)
      // S'inscrire "en ligne" avec le profil
      const p = profileRef.current
      if (p.uid) {
        sendRef.current?.({ type: 'hello', uid: p.uid, name: p.name, avatar: p.avatar })
      }
      // Join the requested code if provided
      if (autoJoinRef.current) {
        autoJoinRef.current()
        autoJoinRef.current = null
      }
    }
    ws.onclose = () => { setConnected(false) }
    ws.onerror = () => setError('Serveur de rooms injoignable')
    ws.onmessage = e => wsMsgHandler.current?.(e.data)
  }, [])

  const wsMsgHandler = useRef<(raw: string) => void>(() => {})
  wsMsgHandler.current = (raw: string) => handleMsg(raw)

  useEffect(() => {
    connect()
    return () => {
      sendRef.current?.({ type: 'leave' })
      wsRef.current?.close()
    }
  }, [connect])

  // Auto-join from ?room= param
  useEffect(() => {
    const code = autoJoinCode?.trim()
    if (!code) return
    autoJoinRef.current = () => {
      const p = profileRef.current
      sendRef.current?.({ type: 'join', code, uid: p.uid, name: p.name, avatar: p.avatar })
    }
    if (connected) autoJoinRef.current()
  }, [autoJoinCode, connected])

  const sendRef = useRef<(o: unknown) => void>(() => {})
  sendRef.current = (o: unknown) => {
    const ws = wsRef.current
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(o))
  }

  const profileRef = useRef<ProfileId>({})

  const create = useCallback((profile: ProfileId) => {
    profileRef.current = profile
    sendRef.current({ type: 'create', uid: profile.uid, name: profile.name, avatar: profile.avatar })
  }, [])

  const join = useCallback((code: string, profile: ProfileId) => {
    profileRef.current = profile
    sendRef.current({ type: 'join', code, uid: profile.uid, name: profile.name, avatar: profile.avatar })
  }, [])

  const leave = useCallback(() => {
    sendRef.current({ type: 'leave' })
    roomRef.current = null
    setRoom(null)
    setJoinRequest(null)
  }, [])

  const sendChat = useCallback((text: string) => {
    if (!text.trim()) return
    sendRef.current({ type: 'chat', text: text.trim() })
  }, [])

  const react = useCallback((emoji: string) => {
    if (!roomRef.current || !selfUidRef.current) return
    sendRef.current({ type: 'react', emoji: String(emoji).slice(0, 8) })
  }, [])

  const setProfile = useCallback((p: ProfileId) => {
    profileRef.current = p
    if (p.uid) {
      sendRef.current({ type: 'hello', uid: p.uid, name: p.name, avatar: p.avatar })
    }
  }, [])

  const requestJoin = useCallback((targetUid: string, profile: ProfileId) => {
    profileRef.current = profile
    if (profile.uid) {
      sendRef.current({ type: 'hello', uid: profile.uid, name: profile.name, avatar: profile.avatar })
    }
    sendRef.current({ type: 'request-join', targetUid, uid: profile.uid, name: profile.name, avatar: profile.avatar })
  }, [])

  const respondJoin = useCallback((targetUid: string, action: 'accept' | 'reject' | 'mute') => {
    setJoinRequest(null)
    sendRef.current({ type: 'respond-join', targetUid, action })
  }, [])

  const report = useCallback((playing: boolean, time: number) => {
    const r = roomRef.current
    if (!r || !selfUidRef.current || r.leaderUid !== selfUidRef.current) return
    sendRef.current({ type: 'time', time: time || 0, playing })
  }, [])

  const reportPlay = useCallback(() => {
    const r = roomRef.current
    if (!r || !selfUidRef.current || r.leaderUid !== selfUidRef.current) return
    sendRef.current({ type: 'time', time: 0, playing: true })
  }, [])

  const reportPause = useCallback(() => {
    const r = roomRef.current
    if (!r || !selfUidRef.current || r.leaderUid !== selfUidRef.current) return
    sendRef.current({ type: 'time', time: 0, playing: false })
  }, [])

  const sendMedia = useCallback((media: RoomMedia) => {
    const r = roomRef.current
    if (!r || !selfUidRef.current || r.leaderUid !== selfUidRef.current) return
    sendRef.current({ type: 'media', media })
  }, [])

  return {
    connected, room, selfUid, error, chats, reactions, setError, onlineUsers, joinRequest,
    roomCommandRef,
    create, join, leave, sendChat, react, setProfile, requestJoin, respondJoin,
    report, reportPlay, reportPause, sendMedia,
    setOnMedia: (fn: (m: RoomMedia) => void) => { onMediaRef.current = fn },
    isLeader: Boolean(room && selfUid && room.leaderUid === selfUid),
  }
}