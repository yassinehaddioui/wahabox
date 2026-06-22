/**
 * Client-side crypto module — all user-facing crypto happens here.
 * Every function is pure crypto: no network calls, no storage.
 *
 * Import only in client components or via dynamic import:
 *   const { crypto } = await import('@/lib/crypto')
 *   await crypto.ready
 */

import sodium, { ready } from 'libsodium-wrappers-sumo'

export type KeyPair = { publicKey: Uint8Array; privateKey: Uint8Array }
export type WrappedKey = { ciphertext: Uint8Array; nonce: Uint8Array }

const OPSLIMIT = 3
const MEMLIMIT = 256 * 1024 * 1024 // 256 MiB
const HASH_BYTES = 32
const MASTER_KEY_BYTES = 64

export const crypto = {
  /** Promise that resolves when libsodium is ready to use. */
  ready,

  /**
   * Derive a 64-byte master key from a password using Argon2id.
   * opslimit ≥ 3, memlimit ≥ 256 MiB, algorithm = Argon2id.
   */
  deriveMasterKey(password: string, salt: Uint8Array): Uint8Array {
    const pwBytes = new TextEncoder().encode(password.normalize('NFKC'))
    return sodium.crypto_pwhash(
      MASTER_KEY_BYTES,
      pwBytes,
      salt,
      OPSLIMIT,
      MEMLIMIT,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    )
  },

  /**
   * HKDF-split a 64-byte master key into auth_key (32 B) and KEK_pw (32 B).
   */
  splitMasterKey(masterKey: Uint8Array): { authKey: Uint8Array; kekPw: Uint8Array } {
    const authKey = sodium.crypto_generichash(
      HASH_BYTES,
      masterKey,
      new TextEncoder().encode('auth'),
    )
    const kekPw = sodium.crypto_generichash(HASH_BYTES, masterKey, new TextEncoder().encode('kek'))
    return { authKey, kekPw }
  },

  /**
   * Derive KEK_rec (32 B) from a recovery code using Argon2id.
   */
  deriveRecoveryKey(recoveryCode: string, salt: Uint8Array): Uint8Array {
    const rcBytes = new TextEncoder().encode(recoveryCode.normalize('NFKC'))
    return sodium.crypto_pwhash(
      HASH_BYTES,
      rcBytes,
      salt,
      OPSLIMIT,
      MEMLIMIT,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    )
  },

  /**
   * Generate a new X25519 keypair.
   */
  generateKeypair(): KeyPair {
    return sodium.crypto_box_keypair()
  },

  /**
   * Encrypt a private key with a key-encryption key using crypto_secretbox.
   */
  wrapPrivateKey(privateKey: Uint8Array, kek: Uint8Array): WrappedKey {
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
    const ciphertext = sodium.crypto_secretbox_easy(privateKey, nonce, kek)
    return { ciphertext, nonce }
  },

  /**
   * Decrypt a private key. Throws on wrong key or tampered data.
   */
  unwrapPrivateKey(ciphertext: Uint8Array, nonce: Uint8Array, kek: Uint8Array): Uint8Array {
    try {
      return sodium.crypto_secretbox_open_easy(ciphertext, nonce, kek)
    } catch {
      throw new Error('Decryption failed: wrong key or tampered ciphertext')
    }
  },

  /**
   * Generate a user-facing recovery code: 16 random bytes → grouped Base64URL.
   */
  generateRecoveryCode(): string {
    const bytes = sodium.randombytes_buf(16)
    const b32 = sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING)
    return b32.match(/.{1,4}/g)?.join('-') ?? b32
  },

  /**
   * Encrypt a message for a recipient using crypto_box_seal (anonymous encryption).
   */
  sealMessage(plaintext: string, recipientPublicKey: Uint8Array): Uint8Array {
    const ptBytes = new TextEncoder().encode(plaintext.normalize('NFC'))
    return sodium.crypto_box_seal(ptBytes, recipientPublicKey)
  },

  /**
   * Decrypt a ciphertext sealed for the given keypair.
   */
  openMessage(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): string {
    const ptBytes = sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey)
    return new TextDecoder().decode(ptBytes)
  },

  /**
   * Decrypt a ciphertext sealed for the given keypair, returning raw bytes.
   */
  openSealed(ciphertext: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array {
    return sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey)
  },

  /**
   * Hash an auth_key with a salt for server-side storage and verification.
   */
  computeAuthVerifier(authKey: Uint8Array, salt: Uint8Array): Uint8Array {
    return sodium.crypto_generichash(HASH_BYTES, authKey, salt)
  },

  /** Generate random bytes of the given length (CSPRNG). */
  randomBytes(length: number): Uint8Array {
    return sodium.randombytes_buf(length)
  },

  /** Encode bytes as base64 for transport. */
  toBase64(bytes: Uint8Array): string {
    return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL)
  },

  /** Decode base64 from transport. */
  fromBase64(s: string): Uint8Array {
    return sodium.from_base64(s, sodium.base64_variants.ORIGINAL)
  },
}
