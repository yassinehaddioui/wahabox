import { describe, expect, it } from 'vitest'
import { getClientIp } from '../client-ip'

describe('getClientIp', () => {
  it('uses the rightmost valid forwarded hop instead of attacker input', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.4' })
    expect(getClientIp(headers)).toBe('10.0.0.4')
  })

  it('supports IPv6 and rejects malformed values', () => {
    expect(getClientIp(new Headers({ 'x-forwarded-for': 'spoofed, 2001:db8::1' }))).toBe(
      '2001:db8::1',
    )
    expect(getClientIp(new Headers({ 'x-real-ip': 'not-an-ip' }))).toBe('unknown')
  })
})
