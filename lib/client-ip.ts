import { isIP } from 'node:net'

function validIp(value: string | null): string | null {
  const candidate = value?.trim()
  return candidate && isIP(candidate) !== 0 ? candidate : null
}

/**
 * Return the hop supplied by the nearest trusted proxy.
 * Caddy appends its value to X-Forwarded-For, so client-supplied values are on
 * the left and must never be used for rate limits or audit attribution.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',')
    for (let i = hops.length - 1; i >= 0; i--) {
      const ip = validIp(hops[i])
      if (ip) return ip
    }
  }

  return validIp(headers.get('x-real-ip')) ?? 'unknown'
}
