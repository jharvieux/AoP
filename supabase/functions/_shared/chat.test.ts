// Deno test for `_shared/chat.ts`'s poke path — the chat side of the #228
// private-channel contract match.test.ts pins for `broadcastTurn`. RLS itself
// (refusing non-participant subscribers) lives in the migration and needs a
// live database; pinned here: the poke goes to the *private* channel and
// carries the row id alone — never the body or channel name (§7 leak-audit).
import { assertEquals } from 'jsr:@std/assert@1'
import { broadcastChat } from './chat.ts'
import type { Db } from './client.ts'

Deno.test('broadcastChat: pokes the private match channel with the id only', async () => {
  const sent: { topic: string; options: unknown; message: unknown }[] = []
  const db = {
    channel(topic: string, options: unknown) {
      return {
        send(message: unknown) {
          sent.push({ topic, options, message })
          return Promise.resolve('ok')
        },
      }
    },
  } as unknown as Db

  await broadcastChat(db, 'm1', 12)

  assertEquals(sent.length, 1)
  assertEquals(sent[0]!.topic, 'match:m1')
  assertEquals(sent[0]!.options, { config: { private: true } })
  assertEquals(sent[0]!.message, {
    type: 'broadcast',
    event: 'chat',
    payload: { type: 'chat', id: 12 },
  })
})
