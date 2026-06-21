import crypto from 'crypto'

let emailKey: Uint8Array | null = null

const KEY_VERSION = 1

function deriveEmailKey(): Uint8Array {
  if (emailKey) return emailKey
  const secret = process.env.SERVER_MASTER_SECRET
  if (!secret) {
    throw new Error('SERVER_MASTER_SECRET is not set')
  }
  emailKey = new Uint8Array(
    crypto.hkdfSync('sha256', Buffer.from(secret, 'base64'), Buffer.alloc(32), 'email-enc', 32),
  )
  return emailKey
}

export function encryptEmail(email: string): { encrypted: Uint8Array; nonce: Uint8Array; keyVersion: number } {
  const key = deriveEmailKey()
  const nonce = new Uint8Array(crypto.randomBytes(12))
  const cipher = crypto.createCipheriv('chacha20-poly1305', Buffer.from(key), Buffer.from(nonce), { authTagLength: 16 })
  const encrypted = new Uint8Array(Buffer.concat([cipher.update(email, 'utf-8'), cipher.final(), cipher.getAuthTag()]))
  return { encrypted, nonce, keyVersion: KEY_VERSION }
}

export function decryptEmail(encrypted: Uint8Array, nonce: Uint8Array): string {
  const key = deriveEmailKey()
  const encBuf = Buffer.from(encrypted)
  const tag = encBuf.subarray(encBuf.length - 16)
  const data = encBuf.subarray(0, encBuf.length - 16)
  const decipher = crypto.createDecipheriv('chacha20-poly1305', Buffer.from(key), Buffer.from(nonce), { authTagLength: 16 })
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString('utf-8')
}

export function clearEmailKey(): void {
  emailKey = null
}
