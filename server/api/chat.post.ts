import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, isLoopFinished } from 'ai'
import { tools } from '../tools'

export default defineEventHandler(async (event) => {
  const { message } = await readBody<{ message: string }>(event)
  const { ai } = useRuntimeConfig()

  const provider = createOpenAICompatible({
    name: 'custom',
    baseURL: ai.baseURL,
    apiKey: ai.apiKey,
  })

  const { text } = await generateText({
    model: provider(ai.model),
    messages: [
      { role: 'user', content: message },
    ],
    tools,
    stopWhen: isLoopFinished(),
  })

  return { reply: text }
})
