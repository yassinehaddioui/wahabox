import crypto from 'crypto'
import { TOTP } from 'otplib'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer: Uint8Array): string {
  let bits = 0, value = 0, output = ''
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(input: string): Buffer {
  input = input.toUpperCase().replace(/=+$/, '')
  let bits = 0, value = 0
  const output: number[] = []
  for (let i = 0; i < input.length; i++) {
    const idx = ALPHABET.indexOf(input[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(output)
}

const totp = new TOTP({
  crypto: {
    name: 'node-crypto',
    randomBytes: (size: number) => crypto.randomBytes(size),
    hmac: async (algo: string, key: Buffer, data: Buffer) =>
      crypto.createHmac(algo, key).update(data).digest(),
    constantTimeEqual: (a: string, b: string) =>
      crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)),
  },
  base32: {
    name: 'custom-base32',
    encode: (bytes: Uint8Array) => base32Encode(bytes),
    decode: (str: string) => base32Decode(str),
  },
})

const RECOVERY_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const RECOVERY_CODE_LENGTH = 16
const RECOVERY_CODE_GROUP = 4
const RECOVERY_CODES_COUNT = 8

export function generateTotpSecret(): string {
  return totp.generateSecret()
}

export function getTotpUri(secret: string, username: string): string {
  return totp.toURI({ label: username, issuer: 'Wahabox', secret })
}

export async function verifyTotp(secret: string, code: string): Promise<boolean> {
  const result = await totp.verify(code, { secret })
  return result.valid
}

export function generateRecoveryCodes(): {
  plain: string[]
  hashed: string[]
} {
  const plain: string[] = []
  const hashed: string[] = []

  for (let i = 0; i < RECOVERY_CODES_COUNT; i++) {
    let code = ''
    const bytes = crypto.randomBytes(RECOVERY_CODE_LENGTH)
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      code += RECOVERY_CODE_CHARSET[bytes[j] % RECOVERY_CODE_CHARSET.length]
    }
    const grouped = code.match(new RegExp(`.{1,${RECOVERY_CODE_GROUP}}`, 'g'))!.join('-')
    plain.push(grouped)

    const hash = crypto.createHash('sha256').update(grouped).digest('base64')
    hashed.push(hash)
  }

  return { plain, hashed }
}

export function verifyRecoveryCode(code: string, hashedCodes: string[]): boolean {
  const codeHash = crypto.createHash('sha256').update(code).digest('base64')
  return hashedCodes.includes(codeHash)
}

export function generateMfaCode(): string {
  const digits: string[] = []
  const bytes = crypto.randomBytes(6)
  for (let i = 0; i < 6; i++) {
    digits.push(String(bytes[i] % 10))
  }
  return digits.join('')
}
