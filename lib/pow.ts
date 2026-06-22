import crypto from 'crypto'
import { withRedis } from './redis'

const CHALLENGE_TTL = 120
const DEFAULT_DIFFICULTY = 16

export type PowChallenge = {
  challenge: string
  difficulty: number
}

export function generateChallenge(difficulty: number = DEFAULT_DIFFICULTY): PowChallenge {
  return {
    challenge: crypto.randomBytes(32).toString('base64url'),
    difficulty,
  }
}

export async function storeChallenge(challenge: string): Promise<void> {
  await withRedis(async (redis) => {
    await redis.set(`pow:${challenge}`, '1', 'EX', CHALLENGE_TTL)
  }, undefined)
}

export function verifyPow(challenge: string, nonce: string): boolean {
  const hash = crypto
    .createHash('sha256')
    .update(challenge + nonce)
    .digest()
  const difficulty = DEFAULT_DIFFICULTY
  const fullBytes = Math.floor(difficulty / 8)
  const remainder = difficulty % 8

  for (let i = 0; i < fullBytes; i++) {
    if (hash[i] !== 0) return false
  }

  if (remainder > 0 && hash[fullBytes] >> (8 - remainder) !== 0) {
    return false
  }

  return true
}

export async function consumeChallenge(challenge: string): Promise<boolean> {
  return withRedis(async (redis) => {
    const result = await redis.del(`pow:${challenge}`)
    return result === 1
  }, true)
}
