/** Constant-time bearer check. A missing or short secret rejects every call. */
export function bearerMatches(authorization: string | null, secret: string): boolean {
  if (secret.length < 32) return false
  const prefix = "Bearer "
  if (authorization == null || !authorization.startsWith(prefix)) return false
  const token = authorization.slice(prefix.length)
  const encoder = new TextEncoder()
  const left = encoder.encode(token)
  const right = encoder.encode(secret)
  const length = Math.max(left.length, right.length, 1)
  let diff = left.length ^ right.length
  for (let index = 0; index < length; index++) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  }
  return diff === 0
}
