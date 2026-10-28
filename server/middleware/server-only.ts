export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) {
    setResponseStatus(event, 404)
    return ''
  }

  const { apiToken } = useRuntimeConfig()
  const given = (getHeader(event, 'authorization') ?? '').replace(/^Bearer /i, '')

  if (!apiToken || given !== apiToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Invalid token',
    })
  }
})
