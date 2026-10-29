export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) {
    setResponseStatus(event, 404)
    return ''
  }

  const { apiToken } = useRuntimeConfig(event)
  const token = (getHeader(event, 'authorization') ?? '').replace(/^Bearer /i, '')

  if (!apiToken || token !== apiToken) {
    throw createError({ statusCode: 401, message: 'Invalid token' })
  }
})
