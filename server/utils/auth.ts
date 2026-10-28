export function extractBearerToken(header: string | undefined): string {
  return (header ?? '').replace(/^Bearer /i, '')
}

export function isValidApiToken(header: string | undefined, expected: string): boolean {
  return !!expected && extractBearerToken(header) === expected
}
