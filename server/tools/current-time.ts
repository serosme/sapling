import { tool } from 'ai'
import { z } from 'zod'

export const currentTime = tool({
  description: '获取当前时间',
  inputSchema: z.object({}),
  execute: () => new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
})
