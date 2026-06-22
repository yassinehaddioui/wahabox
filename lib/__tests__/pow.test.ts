import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { generateChallenge, verifyPow } from '@/lib/pow'

describe('pow module', () => {
  describe('generateChallenge', () => {
    it('returns an object with challenge and difficulty', () => {
      const result = generateChallenge()
      expect(typeof result.challenge).toBe('string')
      expect(typeof result.difficulty).toBe('number')
    })

    it('produces a 32-byte base64url challenge (43 chars, no padding)', () => {
      const { challenge } = generateChallenge()
      expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    })

    it('defaults to difficulty 16', () => {
      const { difficulty } = generateChallenge()
      expect(difficulty).toBe(16)
    })

    it('accepts a custom difficulty', () => {
      const { difficulty } = generateChallenge(8)
      expect(difficulty).toBe(8)
    })

    it('generates unique challenges across calls', () => {
      const a = generateChallenge()
      const b = generateChallenge()
      expect(a.challenge).not.toBe(b.challenge)
    })
  })

  describe('verifyPow', () => {
    // Precomputed pairs for a fixed challenge (difficulty 16 = 2 leading zero bytes).
    // Found via brute-force SHA256 search; deterministic and fast.
    const challenge = 'test-challenge-fixed-for-pow-unit-tests'

    // SHA256(challenge + '35370') starts with 0x00002eb2 — 16 leading zero bits.
    const validNonce = '35370'

    // SHA256(challenge + '389') starts with 0x00b7aa5d — only 8 leading zero bits.
    const insufficientNonce = '389'

    it('returns true for a nonce meeting the 16-bit difficulty', () => {
      expect(verifyPow(challenge, validNonce)).toBe(true)
    })

    it('returns false for a wrong nonce', () => {
      expect(verifyPow(challenge, 'definitely-wrong-nonce')).toBe(false)
    })

    it('returns false for a nonce with insufficient leading zero bits', () => {
      // Confirm the fixture: 8 leading zero bits is less than the required 16.
      const hash = crypto.createHash('sha256').update(challenge + insufficientNonce).digest()
      expect(hash[0]).toBe(0) // first byte zero
      expect(hash[1]).not.toBe(0) // second byte nonzero → only 8 bits

      expect(verifyPow(challenge, insufficientNonce)).toBe(false)
    })
  })
})
