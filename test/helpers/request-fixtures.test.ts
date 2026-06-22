import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createNextRequest, createRouteContext } from './request'
import {
  createUser,
  createPoBox,
  createMessage,
  createPasskeyCredential,
} from './fixtures'
import { parseBody } from '@/lib/validation'

describe('createNextRequest', () => {
  it('parseBody resolves JSON body correctly', async () => {
    const schema = z.object({ name: z.string() })
    const request = createNextRequest('http://localhost/api/test', {
      method: 'POST',
      body: { name: 'hello' },
    })
    const result = await parseBody(request, schema)
    expect(result).toEqual({ name: 'hello' })
  })

  it('sets Content-Type to application/json', () => {
    const request = createNextRequest('http://localhost/api/test', {
      method: 'POST',
      body: { foo: 'bar' },
    })
    expect(request.headers.get('content-type')).toBe('application/json')
  })

  it('cookies are readable via request.cookies.get', () => {
    const request = createNextRequest('http://localhost/api/test', {
      cookies: { session: 'abc123' },
    })
    expect(request.cookies.get('session')?.value).toBe('abc123')
  })

  it('merges custom headers with defaults', () => {
    const request = createNextRequest('http://localhost/api/test', {
      method: 'POST',
      body: {},
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    expect(request.headers.get('content-type')).toBe('application/json')
    expect(request.headers.get('x-forwarded-for')).toBe('1.2.3.4')
  })
})

describe('createRouteContext', () => {
  it('returns params that can be awaited', async () => {
    const ctx = createRouteContext({ slug: 'my-box' })
    const params = await ctx.params
    expect(params).toEqual({ slug: 'my-box' })
  })
})

describe('fixtures', () => {
  it('createUser returns typed user with Buffer fields', () => {
    const user = createUser()
    expect(user.id).toBeTypeOf('string')
    expect(user.username).toBe('testuser')
    expect(Buffer.isBuffer(user.authVerifier)).toBe(true)
    expect(Buffer.isBuffer(user.publicKey)).toBe(true)
    expect(user.tokenVersion).toBe(0)
  })

  it('createUser accepts overrides', () => {
    const user = createUser({ username: 'custom', tokenVersion: 5 })
    expect(user.username).toBe('custom')
    expect(user.tokenVersion).toBe(5)
  })

  it('createPoBox returns owner.publicKey Buffer and _count.messages', () => {
    const box = createPoBox()
    expect(Buffer.isBuffer(box.owner.publicKey)).toBe(true)
    expect(box._count.messages).toBe(0)
    expect(box.passwordHash).toBeNull()
  })

  it('createPoBox accepts overrides', () => {
    const box = createPoBox({ slug: 'custom-slug', _count: { messages: 5 } })
    expect(box.slug).toBe('custom-slug')
    expect(box._count.messages).toBe(5)
  })

  it('createMessage returns typed message with Buffer ciphertext', () => {
    const msg = createMessage()
    expect(Buffer.isBuffer(msg.ciphertext)).toBe(true)
    expect(msg.isRead).toBe(false)
  })

  it('createPasskeyCredential returns typed credential', () => {
    const cred = createPasskeyCredential()
    expect(Buffer.isBuffer(cred.credentialId)).toBe(true)
    expect(Buffer.isBuffer(cred.publicKey)).toBe(true)
    expect(cred.counter).toBe(0)
  })
})
