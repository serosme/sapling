import type { ModelMessage } from 'ai'
import type { ChatMessage } from '../db/chat-messages'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, isLoopFinished } from 'ai'
import { addChatMessage, listChatMessages } from '../db/chat-messages'
import { tools } from '../tools'

function toModelMessage({ role, content }: ChatMessage): ModelMessage {
  return role === 'user'
    ? { role: 'user', content }
    : { role: 'assistant', content }
}

export default defineEventHandler(async (event) => {
  const body = (await readBody<{ message?: string }>(event)) ?? {}
  const message = typeof body.message === 'string'
    ? body.message.trim()
    : ''
  if (!message) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'message is required' })
  }

  const { ai } = useRuntimeConfig()

  const history = (await listChatMessages()).map(toModelMessage)
  await addChatMessage('user', message)

  const provider = createOpenAICompatible({
    name: 'custom',
    baseURL: ai.baseURL,
    apiKey: ai.apiKey,
  })

  const { text } = await generateText({
    model: provider(ai.model),
    messages: [
      ...history,
      { role: 'user', content: message },
    ],
    tools,
    stopWhen: isLoopFinished(),
  })

  await addChatMessage('assistant', text)

  return { reply: text }
})
