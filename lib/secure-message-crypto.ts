import bcrypt from 'bcryptjs'
import { encryptEmail, decryptEmail } from './email-crypto'
import { isSafeMessagePasswordHash } from './secure-message-password'

export function verifyMessagePassword(password: string, hash: string): Promise<boolean> {
  // Protect the reveal path from malformed, legacy, or attacker-inserted hashes.
  // bcrypt cost is encoded in the hash and must be bounded before comparison.
  if (!isSafeMessagePasswordHash(hash)) return Promise.resolve(false)
  return bcrypt.compare(password, hash)
}

export function sealReceiverEmail(email: string) {
  return encryptEmail(email)
}

export function revealReceiverEmail(encrypted: Uint8Array, nonce: Uint8Array): string {
  return decryptEmail(encrypted, nonce)
}
