import type { H3Event } from 'h3'
import { runChat } from '../../ai/reply'
import { addReply, listChatHistoryFor, listPendingUserMessages, markProcessed } from '../../db/chat-messages'

async function processOnce(event: H3Event): Promise<void> {
  const pending = await listPendingUserMessages()

  if (pending.length === 0) {
    return
  }

  const ids = pending.map(message => message.id)
  const history = await listChatHistoryFor(ids)

  await runChat(event, [
    ...history,
    ...pending,
  ], addReply)
  await markProcessed(ids)
}

let queue: Promise<void> = Promise.resolve()

export default defineEventHandler((event) => {
  queue = queue.then(() => processOnce(event)).catch(() => {})
  event.waitUntil(queue)

  return { ok: true }
})
