import { describe, it, expect, vi } from 'vitest'
import { success, error } from '@/lib/response'
import {
  ApiError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  MfaRequiredError,
  InvalidPasswordError,
} from '@/lib/errors'

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

  it('returns 500 and logs unknown errors to console.error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = error(new Error('something broke'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      success: false,
      error: 'Internal server error',
    })
    expect(spy).toHaveBeenCalledWith('[internal]', expect.any(Error))
    spy.mockRestore()
  })
})
