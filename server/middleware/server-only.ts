export default defineEventHandler((event) => {
  if (event.path.startsWith('/api/')) {
    return
  }

  setResponseStatus(event, 404)
  return ''
})
