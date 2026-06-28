import bcrypt from 'bcryptjs'
import { encryptEmail, decryptEmail } from './email-crypto'

export function verifyMessagePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function sealReceiverEmail(email: string) {
  return encryptEmail(email)
}

export function revealReceiverEmail(encrypted: Uint8Array, nonce: Uint8Array): string {
  return decryptEmail(encrypted, nonce)
}
