import { useEffect, useMemo, useState } from 'react'
import type { ChatChannel } from '@aop/shared'
import type { SupabaseConfig } from '../auth/supabaseAuth'
import type { AuthSession } from '../auth/types'
import { ChatClient, type ChatMessage } from './chatClient'
import { subscribeChatSync, type ChatPokeTransport } from './chatSync'

export interface UseMatchChatOptions {
  config: SupabaseConfig
  session: AuthSession
  matchId: string
  /** The Realtime transport wiring `chatSync.ts` to the concrete Supabase channel (or a fake in tests). */
  transport: ChatPokeTransport
  /** Whether the viewer currently holds an alliance — gates the `alliance` channel (§140). */
  hasAlliance: boolean
}

export interface UseMatchChatResult {
  channel: ChatChannel
  setChannel: (channel: ChatChannel) => void
  messages: ChatMessage[]
  sending: boolean
  error: string | null
  send: (body: string) => Promise<void>
}

/**
 * Wires `ChatClient` (the fetch/PostgREST layer) to `subscribeChatSync` (the
 * Realtime-poke-driven refetch, #139) for one match's chat, and exposes the
 * minimal state a chat UI needs. Composes the two pre-existing modules rather
 * than reimplementing either — this hook itself isn't unit-tested (same as
 * `useRemoveAds.ts`); the fetch/send contract it wraps is (`chatClient.test.ts`),
 * and the poke-filtering logic it delegates to is (`chatSync.test.ts`).
 *
 * A channel switch to `alliance` never fires without `hasAlliance` — the panel
 * itself must not offer the tab — but this hook also snaps back to `all` if
 * `hasAlliance` flips to false while `alliance` is selected (the alliance broke
 * mid-session), since RLS would otherwise start returning nothing for it.
 */
export function useMatchChat({
  config,
  session,
  matchId,
  transport,
  hasAlliance,
}: UseMatchChatOptions): UseMatchChatResult {
  const client = useMemo(() => new ChatClient(config), [config])
  const [channel, setChannel] = useState<ChatChannel>('all')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasAlliance && channel === 'alliance') setChannel('all')
  }, [hasAlliance, channel])

  useEffect(() => {
    let cancelled = false
    setMessages([])

    async function load() {
      try {
        const rows = await client.fetchMessages(session, matchId, channel)
        if (!cancelled) setMessages(rows)
      } catch {
        // A background refetch failure just leaves the last-known messages on
        // screen; the next poke or channel switch tries again.
      }
    }

    void load()
    const unsubscribe = subscribeChatSync({ matchId, transport, onChat: () => void load() })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [client, session, matchId, channel, transport])

  async function send(body: string): Promise<void> {
    setSending(true)
    setError(null)
    try {
      await client.send(session, matchId, channel, body)
      // Eager refetch: a dropped broadcast (§6, best-effort) shouldn't leave the
      // sender's own message invisible until some other seat's poke arrives.
      const rows = await client.fetchMessages(session, matchId, channel)
      setMessages(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the message.')
    } finally {
      setSending(false)
    }
  }

  return { channel, setChannel, messages, sending, error, send }
}
