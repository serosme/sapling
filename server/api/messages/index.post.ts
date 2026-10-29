import { addUserMessage } from '../../db/chat-messages'

export default defineEventHandler(async (event) => {
  const body = (await readBody<{ content?: unknown }>(event)) ?? {}
  const content = typeof body.content === 'string'
    ? body.content.trim()
    : ''

  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'content is required' })
  }

  await addUserMessage(content)

  return { ok: true }
})
