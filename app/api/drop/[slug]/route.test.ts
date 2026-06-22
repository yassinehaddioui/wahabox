import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createPoBox } from '@/test/helpers/fixtures'
import { GET, POST } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'

vi.mock('@/lib/rate-limit', () => ({ checkDropRateLimit: vi.fn(), getDropIpCounts: vi.fn(), recordDropIp: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/pow', () => ({ verifyPow: vi.fn(), consumeChallenge: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))
vi.mock('@/lib/turnstile', () => ({ checkTurnstile: vi.fn(), TURNSTILE_PROOF_COOKIE: 'turnstile_proof' }))
vi.mock('@/lib/notifications', () => ({ notifyNewMessage: vi.fn().mockResolvedValue(undefined) }))

import { checkDropRateLimit, getDropIpCounts, recordDropIp } from '@/lib/rate-limit'
import { verifyPow, consumeChallenge } from '@/lib/pow'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { checkTurnstile } from '@/lib/turnstile'
import { notifyNewMessage } from '@/lib/notifications'

const SLUG = 'test-slug'
const CIPHER = Buffer.alloc(64, 0x77).toString('base64')

describe('GET /api/drop/[slug]', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 404 when box does not exist', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(null)
    const res = await GET(createNextRequest(`http://localhost/api/drop/${SLUG}`), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when box is inactive', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox({ isActive: false }))
    const res = await GET(createNextRequest(`http://localhost/api/drop/${SLUG}`), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when box is expired', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox({ expiresAt: new Date('2020-01-01') }))
    const res = await GET(createNextRequest(`http://localhost/api/drop/${SLUG}`), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(404)
  })

  it('returns 404 when box is full', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox({ maxMessages: 5, _count: { messages: 5 } }))
    const res = await GET(createNextRequest(`http://localhost/api/drop/${SLUG}`), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(404)
  })

  it('returns public info for valid box', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox({ label: 'Drop', greeting: 'Hi', _count: { messages: 2 } }))
    const res = await GET(createNextRequest(`http://localhost/api/drop/${SLUG}`), createRouteContext({ slug: SLUG }))
    const body = await res.json()
    expect(body.data.label).toBe('Drop')
    expect(body.data.publicKey).toBeTruthy()
    expect(body.data.hasPassword).toBe(false)
  })

  it('redacts sensitive fields', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox({ passwordHash: '$2a$12$secret' }))
    const res = await GET(createNextRequest(`http://localhost/api/drop/${SLUG}`), createRouteContext({ slug: SLUG }))
    const body = await res.json()
    expect(body.data.passwordHash).toBeUndefined()
    expect(body.data.id).toBeUndefined()
    expect(body.data.ownerId).toBeUndefined()
  })
})

describe('POST /api/drop/[slug]', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 429 when rate limited', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(true)
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(429)
  })

  it('returns 429 when IP hourly quota exceeded', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 30, daily: 5 })
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(429)
  })

  it('returns 429 when IP daily quota exceeded', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 10, daily: 200 })
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(429)
  })

  it('returns 404 when box invalid', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    prismaMock.poBox.findUnique.mockResolvedValue(null)
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(404)
  })

  it('returns 401 when password required but missing', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox({ passwordHash: '$2a$12$hash' }))
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid CSRF', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox())
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER, csrfToken: 'b' } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for failed Turnstile', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox())
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    vi.mocked(checkTurnstile).mockResolvedValue({ verified: false, setProofCookie: null })
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER, csrfToken: 't', turnstileToken: 'b' } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid PoW', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox())
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    vi.mocked(checkTurnstile).mockResolvedValue({ verified: true, setProofCookie: null })
    vi.mocked(verifyPow).mockReturnValue(false)
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER, csrfToken: 't', turnstileToken: 't', challenge: 'c', nonce: 'n' } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(400)
  })

  it('returns 429 when box hourly quota exceeded', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox({ _count: { messages: 15 } }))
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    vi.mocked(checkTurnstile).mockResolvedValue({ verified: true, setProofCookie: null })
    prismaMock.message.count.mockResolvedValueOnce(20).mockResolvedValueOnce(5)
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER, csrfToken: 't', turnstileToken: 't' } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(429)
  })

  it('returns 400 when message too large', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox())
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    vi.mocked(checkTurnstile).mockResolvedValue({ verified: true, setProofCookie: null })
    prismaMock.message.count.mockResolvedValue(0)
    const huge = Buffer.alloc(200 * 1024, 0x01).toString('base64')
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: huge, csrfToken: 't', turnstileToken: 't' } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(400)
  })

  it('rejects honeypot (bot detected)', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER, honeypot: 'I am a bot' } }), createRouteContext({ slug: SLUG }))
    expect(res.status).toBe(400)
  })

  it('accepts valid submission', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    vi.mocked(checkTurnstile).mockResolvedValue({ verified: true, setProofCookie: null })
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox())
    prismaMock.message.count.mockResolvedValue(0)
    prismaMock.message.create.mockResolvedValue({} as any)
    const res = await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER, csrfToken: 't', turnstileToken: 't' } }), createRouteContext({ slug: SLUG }))
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(recordDropIp).toHaveBeenCalled()
    expect(notifyNewMessage).toHaveBeenCalled()
  })

  it('binds CSRF to slug', async () => {
    vi.mocked(checkDropRateLimit).mockResolvedValue(false)
    vi.mocked(getDropIpCounts).mockResolvedValue({ hourly: 0, daily: 0 })
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    vi.mocked(checkTurnstile).mockResolvedValue({ verified: true, setProofCookie: null })
    prismaMock.poBox.findUnique.mockResolvedValue(createPoBox())
    prismaMock.message.count.mockResolvedValue(0)
    prismaMock.message.create.mockResolvedValue({} as any)
    await POST(createNextRequest(`http://localhost/api/drop/${SLUG}`, { method: 'POST', body: { ciphertext: CIPHER, csrfToken: 'my-token', turnstileToken: 't' } }), createRouteContext({ slug: SLUG }))
    expect(verifyAndConsumeCsrfToken).toHaveBeenCalledWith(SLUG, 'my-token')
  })
})
