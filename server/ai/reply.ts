import type { ModelMessage } from 'ai'
import type { H3Event } from 'h3'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, isLoopFinished } from 'ai'
import { tools } from '../tools'
import { IDENTITY } from './identity'

const SILENCE_TAG = '<silence/>'

const SPEAK_RULES = `说话的规则：
- 你输出的文字，就是你说给对方的话，会被原样发过去。
- 这一轮不想说话，就只输出 ${SILENCE_TAG}，不要带任何别的字。
- 想说话就直接说，不要加 ${SILENCE_TAG}，也不要加任何前缀或标签。`

function stripSilenceTag(text: string): string {
  return text.replaceAll(SILENCE_TAG, '').trim()
}

export async function runChat(
  event: H3Event,
  messages: ModelMessage[],
  onReply: (content: string) => Promise<void>,
): Promise<void> {
  const { ai } = useRuntimeConfig(event)

  const provider = createOpenAICompatible({
    name: 'custom',
    baseURL: ai.baseURL,
    apiKey: ai.apiKey,
  })

  const result = await generateText({
    model: provider(ai.model),
    instructions: `${IDENTITY}\n\n${SPEAK_RULES}`,
    messages,
    tools,
    stopWhen: isLoopFinished(),
  })

  const text = stripSilenceTag(result.text)

  if (!text) {
    return
  }

  await onReply(text)
}
