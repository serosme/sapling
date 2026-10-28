export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) {
    setResponseStatus(event, 404)
    return ''
  }

  const { apiToken } = useRuntimeConfig()
  if (!isValidApiToken(getHeader(event, 'authorization'), apiToken)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'Invalid token',
    })
  }
})
