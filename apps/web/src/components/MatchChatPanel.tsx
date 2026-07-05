import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import type { ChatPokeTransport } from '../multiplayer/chatSync'
import { useMatchChat } from '../multiplayer/useMatchChat'
import { ChatPanel } from './ChatPanel'

export interface MatchChatPanelProps {
  config: SupabaseConfig
  session: AuthSession
  matchId: string
  /** The Realtime transport a match screen wires up to the concrete Supabase channel. */
  transport: ChatPokeTransport
  hasAlliance: boolean
  viewerSeat: number
  seatName?: (seat: number) => string
  onClose: () => void
}

/**
 * The drop-in chat panel for a live multiplayer match screen: wires
 * `useMatchChat` (fetch + `send-chat` + the #139 Realtime poke refetch) to the
 * presentational `ChatPanel`. Split out so `ChatPanel` itself stays a plain,
 * props-driven component usable in isolation (e.g. from a future match screen
 * that already manages its own chat state).
 */
export function MatchChatPanel({
  config,
  session,
  matchId,
  transport,
  hasAlliance,
  viewerSeat,
  seatName,
  onClose,
}: MatchChatPanelProps) {
  const { channel, setChannel, messages, sending, error, send } = useMatchChat({
    config,
    session,
    matchId,
    transport,
    hasAlliance,
  })

  return (
    <ChatPanel
      channel={channel}
      onChannelChange={setChannel}
      hasAlliance={hasAlliance}
      messages={messages}
      viewerSeat={viewerSeat}
      seatName={seatName}
      sending={sending}
      error={error}
      onSend={send}
      onClose={onClose}
    />
  )
}
