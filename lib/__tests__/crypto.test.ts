import { describe, it, expect, beforeAll } from 'vitest'
import sodium from 'libsodium-wrappers-sumo'
import { crypto } from '@/lib/crypto'

beforeAll(async () => {
  await crypto.ready
})

function salt16(): Uint8Array {
  return sodium.randombytes_buf(16)
}

describe('crypto module', () => {
  it('generates a valid keypair', () => {
    const kp = crypto.generateKeypair()
    expect(kp.publicKey).toBeInstanceOf(Uint8Array)
    expect(kp.publicKey).toHaveLength(32)
    expect(kp.privateKey).toBeInstanceOf(Uint8Array)
    expect(kp.privateKey).toHaveLength(32)
  })

  it('derives a 64-byte master key from password', () => {
    const mk = crypto.deriveMasterKey('test-password', salt16())
    expect(mk).toBeInstanceOf(Uint8Array)
    expect(mk).toHaveLength(64)
  })

  it('splits master key into auth_key and KEK_pw', () => {
    const mk = crypto.deriveMasterKey('test-password', salt16())
    const { authKey, kekPw } = crypto.splitMasterKey(mk)
    expect(authKey).toHaveLength(32)
    expect(kekPw).toHaveLength(32)
    expect(authKey).not.toEqual(kekPw)
  })

  it('generates a recovery code in grouped format', () => {
    const code = crypto.generateRecoveryCode()
    expect(typeof code).toBe('string')
    expect(code.length).toBeGreaterThan(0)
    expect(code).toMatch(/^[A-Za-z0-9_-]+(-[A-Za-z0-9_-]+)*$/)
  })

  it('derives KEK_rec from recovery code', () => {
    const code = crypto.generateRecoveryCode()
    const kek = crypto.deriveRecoveryKey(code, salt16())
    expect(kek).toHaveLength(32)
  })

  it('wraps and unwraps a private key with the same KEK (round-trip)', () => {
    const kp = crypto.generateKeypair()
    const mk = crypto.deriveMasterKey('test-password', salt16())
    const { kekPw } = crypto.splitMasterKey(mk)

    const wrapped = crypto.wrapPrivateKey(kp.privateKey, kekPw)
    expect(wrapped.ciphertext).toBeInstanceOf(Uint8Array)
    expect(wrapped.nonce).toBeInstanceOf(Uint8Array)
    expect(wrapped.nonce).toHaveLength(24)

    const unwrapped = crypto.unwrapPrivateKey(wrapped.ciphertext, wrapped.nonce, kekPw)
    expect(unwrapped).toEqual(kp.privateKey)
  })

  it('throws on unwrap with wrong KEK', () => {
    const kp = crypto.generateKeypair()
    const mk = crypto.deriveMasterKey('password-a', salt16())
    const { kekPw } = crypto.splitMasterKey(mk)
    const wrapped = crypto.wrapPrivateKey(kp.privateKey, kekPw)

    const mk2 = crypto.deriveMasterKey('password-b', salt16())
    const { kekPw: wrongKek } = crypto.splitMasterKey(mk2)

    expect(() =>
      crypto.unwrapPrivateKey(wrapped.ciphertext, wrapped.nonce, wrongKek),
    ).toThrow('Decryption failed')
  })

  it('wraps same key under both KEK_pw and KEK_rec and unwraps with either', () => {
    const kp = crypto.generateKeypair()
    const mk = crypto.deriveMasterKey('password', salt16())
    const { kekPw } = crypto.splitMasterKey(mk)

    const code = crypto.generateRecoveryCode()
    const kekRec = crypto.deriveRecoveryKey(code, salt16())

    const wrappedPw = crypto.wrapPrivateKey(kp.privateKey, kekPw)
    const wrappedRec = crypto.wrapPrivateKey(kp.privateKey, kekRec)

    const fromPw = crypto.unwrapPrivateKey(wrappedPw.ciphertext, wrappedPw.nonce, kekPw)
    const fromRec = crypto.unwrapPrivateKey(
      wrappedRec.ciphertext,
      wrappedRec.nonce,
      kekRec,
    )

    expect(fromPw).toEqual(kp.privateKey)
    expect(fromRec).toEqual(kp.privateKey)
    expect(fromPw).toEqual(fromRec)
  })

  it('seals and opens a message (round-trip)', () => {
    const kp = crypto.generateKeypair()
    const message = 'Hello, this is a secret message!'

    const ciphertext = crypto.sealMessage(message, kp.publicKey)
    expect(ciphertext).toBeInstanceOf(Uint8Array)

    const decrypted = crypto.openMessage(ciphertext, kp.publicKey, kp.privateKey)
    expect(decrypted).toBe(message)
  })

  it('sealMessage rejects tampered ciphertext', () => {
    const recipient = crypto.generateKeypair()
    const message = 'Test message'

    const ciphertext = crypto.sealMessage(message, recipient.publicKey)
    ciphertext[0] ^= 0xff

    expect(() =>
      crypto.openMessage(ciphertext, recipient.publicKey, recipient.privateKey),
    ).toThrow()
  })

  it('computes and verifies auth verifier', () => {
    const mk = crypto.deriveMasterKey('test-password', salt16())
    const { authKey } = crypto.splitMasterKey(mk)
    const verifierSalt = salt16()

    const verifier = crypto.computeAuthVerifier(authKey, verifierSalt)
    expect(verifier).toBeInstanceOf(Uint8Array)
    expect(verifier).toHaveLength(32)

    const sameVerifier = crypto.computeAuthVerifier(authKey, verifierSalt)
    expect(sameVerifier).toEqual(verifier)
  })
})
