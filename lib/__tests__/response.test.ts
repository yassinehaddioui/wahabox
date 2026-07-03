import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/lib/reporter', () => ({
  reportError: vi.fn().mockResolvedValue(undefined),
}))

import { success, error } from '@/lib/response'
import {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  MfaRequiredError,
  MessageNotAvailableError,
  InvalidPasswordError,
} from '@/lib/errors'
import { logger } from '@/lib/logger'
import { reportError } from '@/lib/reporter'

describe('success', () => {
  it('returns 200 with success: true and data', async () => {
    const res = success({ id: 1, name: 'test' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { id: 1, name: 'test' } })
  })

  it('accepts a custom status code', async () => {
    const res = success(null, 201)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: null })
  })
})

describe('error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles BadRequestError', async () => {
    const res = error(new BadRequestError('Invalid input'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Invalid input',
      code: 'BAD_REQUEST',
    })
  })

  it('handles UnauthorizedError', async () => {
    const res = error(new UnauthorizedError())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    })
  })

  it('handles NotFoundError', async () => {
    const res = error(new NotFoundError())
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Not found',
      code: 'NOT_FOUND',
    })
  })

  it('handles ConflictError', async () => {
    const res = error(new ConflictError())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Conflict',
      code: 'CONFLICT',
    })
  })

  it('handles RateLimitError', async () => {
    const res = error(new RateLimitError())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Too many requests',
      code: 'RATE_LIMITED',
    })
  })

  it('handles InvalidPasswordError', async () => {
    const res = error(new InvalidPasswordError())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Invalid password',
      code: 'INVALID_PASSWORD',
    })
  })

  it('handles a generic ApiError', async () => {
    const res = error(new ApiError('custom', 418, 'TEAPOT'))
    expect(res.status).toBe(418)
    expect(await res.json()).toEqual({
      success: false,
      error: 'custom',
      code: 'TEAPOT',
    })
  })

  it('handles MfaRequiredError with extra fields', async () => {
    const res = error(new MfaRequiredError('MFA required', 'tok-1', ['totp', 'sms']))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      success: false,
      error: 'MFA required',
      code: 'MFA_REQUIRED',
      mfaToken: 'tok-1',
      methods: ['totp', 'sms'],
    })
  })

  it('handles MessageNotAvailableError with startDate', async () => {
    const start = new Date('2026-07-04T00:00:00Z')
    const res = error(new MessageNotAvailableError('Not yet', start))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Not yet',
      code: 'MESSAGE_NOT_AVAILABLE',
      startDate: '2026-07-04T00:00:00.000Z',
    })
  })

  it('handles a generic ApiError with status 500', async () => {
    const res = error(new ApiError('db down', 500, 'DB_ERROR'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      success: false,
      error: 'db down',
      code: 'DB_ERROR',
    })
  })

  it('returns 500 and logs unknown errors via logger.error and reportError', async () => {
    const err = new Error('something broke')
    const res = error(err)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Internal server error',
    })
    expect(logger.error).toHaveBeenCalledWith(err, { source: 'server' })
    expect(reportError).toHaveBeenCalledWith(err, { source: 'server' })
  })

  it('does NOT call reportError for a 4xx ApiError (BadRequestError)', async () => {
    const res = error(new BadRequestError('bad'))
    expect(res.status).toBe(400)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('does NOT call reportError for a server-side ApiError (500 - hits ApiError branch, not fallthrough)', async () => {
    const res = error(new ApiError('db down', 500, 'DB_ERROR'))
    expect(res.status).toBe(500)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('returns 500 synchronously even when reportError never resolves (fire-and-forget)', async () => {
    // Mock reportError to return a promise that never resolves
    vi.mocked(reportError).mockReturnValue(new Promise(() => {}))
    const err = new Error('boom')
    // error() must NOT await — it should return immediately (sync)
    const res = error(err)
    // If we reach here, error() returned synchronously (not blocked by the never-resolving promise)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Internal server error',
    })
    expect(logger.error).toHaveBeenCalledWith(err, { source: 'server' })
    expect(reportError).toHaveBeenCalledWith(err, { source: 'server' })
  })
})
