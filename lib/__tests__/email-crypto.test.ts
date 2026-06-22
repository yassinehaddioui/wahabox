import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encryptEmail, decryptEmail, clearEmailKey } from '@/lib/email-crypto'

// Test-safe secrets — never use real SERVER_MASTER_SECRET values.
// Base64 of a 47-byte UTF-8 string (exceeds the 32-byte minimum).
const TEST_SECRET = Buffer.from('test-master-secret-32-bytes-long-for-unit-tests', 'utf8').toString(
  'base64',
)
const ALT_SECRET = Buffer.from('alt-master-secret-32-bytes-long-for-unit-tests', 'utf8').toString(
  'base64',
)

describe('email-crypto', () => {
  beforeEach(() => {
    clearEmailKey()
    process.env.SERVER_MASTER_SECRET = TEST_SECRET
  })

  afterEach(() => {
    clearEmailKey()
    process.env.SERVER_MASTER_SECRET = TEST_SECRET
  })

  it('encrypt->decrypt round-trip preserves the email', () => {
    const email = 'user@example.com'
    const { encrypted, nonce, keyVersion } = encryptEmail(email)

    expect(keyVersion).toBe(1)
    expect(encrypted).toBeInstanceOf(Uint8Array)
    expect(nonce).toBeInstanceOf(Uint8Array)
    expect(nonce).toHaveLength(12)
    expect(decryptEmail(encrypted, nonce)).toBe(email)
  })

  it('round-trip preserves unicode emails', () => {
    const email = 'üser@exämple.com'
    const { encrypted, nonce } = encryptEmail(email)

    expect(decryptEmail(encrypted, nonce)).toBe(email)
  })

  it('produces distinct ciphertexts and nonces across calls', () => {
    const a = encryptEmail('a@example.com')
    const b = encryptEmail('b@example.com')

    expect(a.encrypted).not.toEqual(b.encrypted)
    expect(a.nonce).not.toEqual(b.nonce)
  })

  // decryptEmail has no keyVersion parameter; a version mismatch is
  // observable as a key-derivation mismatch. We simulate a rotated key
  // version by clearing the cache and swapping SERVER_MASTER_SECRET,
  // then confirm the old ciphertext can no longer be authenticated.
  it('decrypt with a wrong key version (rotated secret) throws', () => {
    const { encrypted, nonce } = encryptEmail('user@example.com')

    clearEmailKey()
    process.env.SERVER_MASTER_SECRET = ALT_SECRET

    expect(() => decryptEmail(encrypted, nonce)).toThrow()
  })

  it('rejects a tampered ciphertext byte (auth-tag mismatch)', () => {
    const { encrypted, nonce } = encryptEmail('user@example.com')
    const tampered = new Uint8Array(encrypted)
    tampered[0] ^= 0xff

    expect(() => decryptEmail(tampered, nonce)).toThrow()
  })

  it('rejects a tampered auth tag', () => {
    const { encrypted, nonce } = encryptEmail('user@example.com')
    const tampered = new Uint8Array(encrypted)
    // Auth tag is the trailing 16 bytes.
    tampered[tampered.length - 1] ^= 0xff

    expect(() => decryptEmail(tampered, nonce)).toThrow()
  })

  it('clearEmailKey forces re-derivation from the current secret', () => {
    const { encrypted: encA, nonce: nonceA } = encryptEmail('user@example.com')

    process.env.SERVER_MASTER_SECRET = ALT_SECRET
    clearEmailKey()

    const { encrypted: encB, nonce: nonceB } = encryptEmail('user@example.com')

    // New key decrypts the new ciphertext.
    expect(decryptEmail(encB, nonceB)).toBe('user@example.com')
    // New key cannot authenticate the old ciphertext.
    expect(() => decryptEmail(encA, nonceA)).toThrow()
  })

  it('without clearEmailKey the cached key survives a secret change', () => {
    const { encrypted: encA, nonce: nonceA } = encryptEmail('user@example.com')

    // Swap the secret WITHOUT clearing the cache.
    process.env.SERVER_MASTER_SECRET = ALT_SECRET

    // The cached key is still the original, so the old ciphertext decrypts.
    expect(decryptEmail(encA, nonceA)).toBe('user@example.com')
  })
})
