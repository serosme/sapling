import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, notInArray, or } from 'drizzle-orm'

export type ChatRole = (typeof schema.chatMessages.$inferSelect)['role']

const DAY_MS = 24 * 60 * 60 * 1000
const HISTORY_DAYS = 7
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

async function addMessage(role: ChatRole, content: string): Promise<void> {
  await db.insert(schema.chatMessages).values({ role, content })
}

export function addUserMessage(content: string): Promise<void> {
  return addMessage('user', content)
}

export function addReply(content: string): Promise<void> {
  return addMessage('assistant', content)
}

export function listPendingUserMessages() {
  return db
    .select({
      id: schema.chatMessages.id,
      role: schema.chatMessages.role,
      content: schema.chatMessages.content,
    })
    .from(schema.chatMessages)
    .where(and(
      eq(schema.chatMessages.role, 'user'),
      isNull(schema.chatMessages.processedAt),
    ))
    .orderBy(asc(schema.chatMessages.id))
}

export async function markProcessed(ids: number[]): Promise<void> {
  await db
    .update(schema.chatMessages)
    .set({
      processedAt: new Date(),
    })
    .where(inArray(schema.chatMessages.id, ids))
}

export function listChatHistoryFor(batchIds: number[]) {
  return db
    .select({ role: schema.chatMessages.role, content: schema.chatMessages.content })
    .from(schema.chatMessages)
    .where(and(
      gte(schema.chatMessages.createdAt, historySince()),
      or(
        ne(schema.chatMessages.role, 'user'),
        isNotNull(schema.chatMessages.processedAt),
      ),
      notInArray(schema.chatMessages.id, batchIds),
    ))
    .orderBy(asc(schema.chatMessages.id))
}

function historySince(): Date {
  const shanghaiTodayStart = Math.floor((Date.now() + SHANGHAI_OFFSET_MS) / DAY_MS) * DAY_MS
  return new Date(shanghaiTodayStart - (HISTORY_DAYS - 1) * DAY_MS - SHANGHAI_OFFSET_MS)
}
