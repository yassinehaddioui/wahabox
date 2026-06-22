import { describe, it, expect, beforeEach } from 'vitest'
import crypto from 'crypto'
// prisma-mock must be imported before @/lib/session so vi.mock('@/lib/prisma')
// registers before @/lib/session resolves its `import prisma from '@/lib/prisma'`.
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createSession, getSession } from '@/lib/session'

// test/setup.ts guarantees SESSION_SECRET is set before any test file loads.
// `?? ''` narrows the type to string; the guard rejects an empty secret too.
const SECRET = process.env.SESSION_SECRET ?? ''
if (!SECRET) throw new Error('SESSION_SECRET must be set by test/setup.ts')

const SESSION_MAX_AGE = 24 * 60 * 60 * 1000

/** HMAC-SHA256 over `data` with `secret`, base64 digest — mirrors lib/session.ts `sign`. */
function signWith(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64')
}

/** Craft a token in the `encoded.signature` format without touching Prisma. */
function craftToken(payload: Record<string, unknown>, secret: string = SECRET): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
  return `${encoded}.${signWith(encoded, secret)}`
}

describe('session HMAC (createSession / getSession)', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  describe('createSession', () => {
    it('produces a token in encoded.signature format with a valid HMAC', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 2 })
      const token = await createSession('user-1', 'alice')

      const dot = token.lastIndexOf('.')
      expect(dot).toBeGreaterThan(0)
      const encoded = token.slice(0, dot)
      const signature = token.slice(dot + 1)
      expect(signature).toBe(signWith(encoded, SECRET))
    })

    it('embeds userId, username, tokenVersion, and createdAt in the payload', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 5 })
      const token = await createSession('user-42', 'bob')

      const session = getSession(token)
      expect(session).toBeDefined()
      expect(session?.userId).toBe('user-42')
      expect(session?.username).toBe('bob')
      expect(session?.tokenVersion).toBe(5)
      expect(typeof session?.createdAt).toBe('number')
    })

    it('defaults tokenVersion to 0 when the user is not found in the DB', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null)
      const token = await createSession('ghost', 'noone')

      const session = getSession(token)
      expect(session?.tokenVersion).toBe(0)
    })
  })

  describe('getSession — valid token', () => {
    it('returns the full payload for a freshly signed token', () => {
      const createdAt = Date.now()
      const token = craftToken({
        userId: 'u1',
        username: 'alice',
        tokenVersion: 1,
        createdAt,
      })

      expect(getSession(token)).toEqual({
        userId: 'u1',
        username: 'alice',
        tokenVersion: 1,
        createdAt,
      })
    })
  })

  describe('getSession — expired token', () => {
    it('returns undefined when createdAt is older than SESSION_MAX_AGE', () => {
      const createdAt = Date.now() - (SESSION_MAX_AGE + 1000)
      const token = craftToken({
        userId: 'u1',
        username: 'alice',
        tokenVersion: 1,
        createdAt,
      })

      expect(getSession(token)).toBeUndefined()
    })

    it('returns the payload when createdAt is just within SESSION_MAX_AGE', () => {
      const createdAt = Date.now() - (SESSION_MAX_AGE - 1000)
      const token = craftToken({
        userId: 'u1',
        username: 'alice',
        tokenVersion: 1,
        createdAt,
      })

      expect(getSession(token)).toBeDefined()
    })
  })

  describe('getSession — malformed token', () => {
    it('returns undefined for a token with no dot separator', () => {
      expect(getSession('justencodedbase64nodelim')).toBeUndefined()
    })

    it('returns undefined for an empty string', () => {
      expect(getSession('')).toBeUndefined()
    })

    it('returns undefined when the payload is not valid JSON', () => {
      const encoded = Buffer.from('not-json{').toString('base64')
      const token = `${encoded}.${signWith(encoded, SECRET)}`

      expect(getSession(token)).toBeUndefined()
    })

    it('returns undefined when the signature length differs from expected', () => {
      const encoded = Buffer.from(
        JSON.stringify({
          userId: 'u1',
          username: 'a',
          tokenVersion: 0,
          createdAt: Date.now(),
        }),
      ).toString('base64')
      const token = `${encoded}.tooshort`

      expect(getSession(token)).toBeUndefined()
    })

    it('returns undefined when payload is missing userId', () => {
      const token = craftToken({
        username: 'alice',
        tokenVersion: 1,
        createdAt: Date.now(),
      })

      expect(getSession(token)).toBeUndefined()
    })

    it('returns undefined when payload is missing username', () => {
      const token = craftToken({
        userId: 'u1',
        tokenVersion: 1,
        createdAt: Date.now(),
      })

      expect(getSession(token)).toBeUndefined()
    })
  })

  describe('getSession — wrong secret', () => {
    it('returns undefined for a token signed with a different secret', () => {
      const token = craftToken(
        { userId: 'u1', username: 'alice', tokenVersion: 1, createdAt: Date.now() },
        'a-completely-different-secret',
      )

      expect(getSession(token)).toBeUndefined()
    })
  })
})
