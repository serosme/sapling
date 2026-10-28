import { desc, gte } from 'drizzle-orm'

export type ChatRole = (typeof schema.chatMessages.$inferSelect)['role']

export interface ChatMessage {
  role: ChatRole
  content: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const HISTORY_DAYS = 7
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

export async function addChatMessage(role: ChatRole, content: string): Promise<void> {
  await db.insert(schema.chatMessages).values({ role, content })
}

export async function listChatMessages(): Promise<ChatMessage[]> {
  const shanghaiTodayStart = Math.floor((Date.now() + SHANGHAI_OFFSET_MS) / DAY_MS) * DAY_MS
  const since = new Date(shanghaiTodayStart - (HISTORY_DAYS - 1) * DAY_MS - SHANGHAI_OFFSET_MS)

  const rows = await db
    .select({ role: schema.chatMessages.role, content: schema.chatMessages.content })
    .from(schema.chatMessages)
    .where(gte(schema.chatMessages.createdAt, since))
    .orderBy(desc(schema.chatMessages.id))

  return rows.reverse()
}
