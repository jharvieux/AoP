import { useState } from 'react'
import { MAX_CHAT_LENGTH, normalizeChatBody, type ChatChannel } from '@aop/shared'
import { BottomSheet } from './BottomSheet'
import type { ChatMessage } from '../multiplayer/chatClient'

export interface ChatPanelProps {
  channel: ChatChannel
  onChannelChange: (channel: ChatChannel) => void
  /** Gates the `alliance` tab (#140) — only visible/usable while the viewer holds an alliance. */
  hasAlliance: boolean
  messages: ChatMessage[]
  viewerSeat: number
  /** Displays a seat number as a name (e.g. from `match_players`/`profiles`); falls back to "Seat N" if omitted. */
  seatName?: ((seat: number) => string) | undefined
  sending: boolean
  error: string | null
  onSend: (body: string) => void | Promise<void>
  onClose: () => void
}

/**
 * The per-match chat UI (#141): an "all" channel every seat reads, and an
 * alliance-scoped channel visible only while allied (#139/#140). Purely
 * presentational — the poke-driven refetch and the `send-chat` call live in
 * `useMatchChat.ts`/`chatClient.ts`; this component only renders whatever it's
 * handed and forwards `onSend`.
 */
export function ChatPanel({
  channel,
  onChannelChange,
  hasAlliance,
  messages,
  viewerSeat,
  seatName,
  sending,
  error,
  onSend,
  onClose,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const normalized = normalizeChatBody(draft)
  const canSend = normalized.ok && !sending

  function label(seat: number) {
    return seatName ? seatName(seat) : `Seat ${seat}`
  }

  async function handleSend() {
    if (!normalized.ok) return
    await onSend(normalized.body)
    setDraft('')
  }

  return (
    <BottomSheet title="Chat" onClose={onClose}>
      <div className="button-group chat-panel__tabs">
        <button
          className={channel === 'all' ? 'primary' : 'secondary'}
          onClick={() => onChannelChange('all')}
        >
          All
        </button>
        {hasAlliance && (
          <button
            className={channel === 'alliance' ? 'primary' : 'secondary'}
            onClick={() => onChannelChange('alliance')}
          >
            Alliance
          </button>
        )}
      </div>

      <ul className="chat-panel__messages">
        {messages.length === 0 ? (
          <li className="diplomacy-empty">No messages yet.</li>
        ) : (
          messages.map((m) => (
            <li
              key={m.id}
              className={m.seat === viewerSeat ? 'chat-message chat-message--own' : 'chat-message'}
            >
              <span className="chat-message__author">{label(m.seat)}</span>
              <span className="chat-message__body">{m.body}</span>
            </li>
          ))
        )}
      </ul>

      {error && <p className="theme-error">{error}</p>}

      <div className="chat-panel__composer">
        <input
          className="text-input"
          type="text"
          value={draft}
          maxLength={MAX_CHAT_LENGTH}
          placeholder={channel === 'alliance' ? 'Message your alliance…' : 'Message everyone…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSend) void handleSend()
          }}
        />
        <button className="primary" disabled={!canSend} onClick={() => void handleSend()}>
          Send
        </button>
      </div>
    </BottomSheet>
  )
}
