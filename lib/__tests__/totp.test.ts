import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib'
import {
  generateRecoveryCodes,
  verifyRecoveryCode,
  generateMfaCode,
  getTotpUri,
  verifyTotp,
  generateTotpSecret,
} from '@/lib/totp'

const RECOVERY_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// Build a TOTP instance with standard otplib plugins to generate valid codes
// for testing. HMAC-SHA1 and base32 (RFC 4648) are standard algorithms, so
// codes generated here are accepted by the custom instance in lib/totp.ts
// which uses node crypto + a custom base32 with the same RFC 4648 alphabet.
const testTotp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
})

describe('generateRecoveryCodes', () => {
  it('returns exactly 8 plain codes and 8 hashed codes', () => {
    const { plain, hashed } = generateRecoveryCodes()
    expect(plain).toHaveLength(8)
    expect(hashed).toHaveLength(8)
  })

  it('produces codes in XXXX-XXXX-XXXX-XXXX format with 16 charset chars', () => {
    const { plain } = generateRecoveryCodes()
    for (const code of plain) {
      expect(code).toHaveLength(19) // 16 chars + 3 dashes
      const groups = code.split('-')
      expect(groups).toHaveLength(4)
      for (const group of groups) {
        expect(group).toHaveLength(4)
        for (const char of group) {
          expect(RECOVERY_CODE_CHARSET).toContain(char)
        }
      }
    }
  })

  it('produces unique plain codes', () => {
    const { plain } = generateRecoveryCodes()
    expect(new Set(plain).size).toBe(plain.length)
  })

  it('produces unique hashed codes', () => {
    const { hashed } = generateRecoveryCodes()
    expect(new Set(hashed).size).toBe(hashed.length)
  })
})

describe('verifyRecoveryCode', () => {
  it('returns true for a valid recovery code from the set', () => {
    const { plain, hashed } = generateRecoveryCodes()
    expect(verifyRecoveryCode(plain[0], hashed)).toBe(true)
  })

  it('returns true for every code in the set', () => {
    const { plain, hashed } = generateRecoveryCodes()
    for (const code of plain) {
      expect(verifyRecoveryCode(code, hashed)).toBe(true)
    }
  })

  it('returns false for a code not in the set', () => {
    const { hashed } = generateRecoveryCodes()
    expect(verifyRecoveryCode('XXXX-XXXX-XXXX-XXXX', hashed)).toBe(false)
  })

  it('returns false for an empty string', () => {
    const { hashed } = generateRecoveryCodes()
    expect(verifyRecoveryCode('', hashed)).toBe(false)
  })
})

describe('generateMfaCode', () => {
  it('returns a 6-digit numeric string', () => {
    const code = generateMfaCode()
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^\d{6}$/)
  })
})

describe('getTotpUri', () => {
  it('returns an otpauth:// URI with issuer Wahabox and the given username', () => {
    const secret = generateTotpSecret()
    const uri = getTotpUri(secret, 'user@example.com')
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain('Wahabox:user%40example.com')
    expect(uri).toContain('issuer=Wahabox')
    expect(uri).toContain(`secret=${secret}`)
  })

  it('encodes the username in the label', () => {
    const secret = generateTotpSecret()
    const uri = getTotpUri(secret, 'alice')
    expect(uri).toContain('Wahabox:alice')
  })
})

describe('verifyTotp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns true for a valid TOTP code at the current time', async () => {
    const secret = generateTotpSecret()
    const code = await testTotp.generate({ secret })
    const result = await verifyTotp(secret, code)
    expect(result).toBe(true)
  })

  it('returns false for a wrong TOTP code', async () => {
    const secret = generateTotpSecret()
    const realCode = await testTotp.generate({ secret })
    const wrongCode = realCode === '000000' ? '111111' : '000000'
    const result = await verifyTotp(secret, wrongCode)
    expect(result).toBe(false)
  })

  it('returns false for a code from a previous time window', async () => {
    const secret = generateTotpSecret()
    const code = await testTotp.generate({ secret })
    // Advance 5 minutes past the 30-second window (default epochTolerance is 0)
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'))
    const result = await verifyTotp(secret, code)
    expect(result).toBe(false)
  })
})
