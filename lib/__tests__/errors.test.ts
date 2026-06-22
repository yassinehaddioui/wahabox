import { describe, it, expect } from 'vitest'
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

describe('ApiError', () => {
  it('is an Error instance', () => {
    const err = new ApiError('boom')
    expect(err).toBeInstanceOf(Error)
  })

  it('defaults statusCode to 500 and code to undefined', () => {
    const err = new ApiError('boom')
    expect(err.statusCode).toBe(500)
    expect(err.code).toBeUndefined()
    expect(err.name).toBe('ApiError')
    expect(err.message).toBe('boom')
  })

  it('accepts explicit statusCode and code', () => {
    const err = new ApiError('boom', 418, 'IM_A_TEAPOT')
    expect(err.statusCode).toBe(418)
    expect(err.code).toBe('IM_A_TEAPOT')
  })
})

describe('BadRequestError', () => {
  it('extends ApiError', () => {
    expect(new BadRequestError()).toBeInstanceOf(ApiError)
  })

  it('has status 400, code BAD_REQUEST, default message', () => {
    const err = new BadRequestError()
    expect(err.statusCode).toBe(400)
    expect(err.code).toBe('BAD_REQUEST')
    expect(err.message).toBe('Bad request')
    expect(err.name).toBe('BadRequestError')
  })

  it('accepts a custom message', () => {
    expect(new BadRequestError('nope').message).toBe('nope')
  })
})

describe('UnauthorizedError', () => {
  it('extends ApiError', () => {
    expect(new UnauthorizedError()).toBeInstanceOf(ApiError)
  })

  it('has status 401, code UNAUTHORIZED, default message', () => {
    const err = new UnauthorizedError()
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.message).toBe('Unauthorized')
    expect(err.name).toBe('UnauthorizedError')
  })
})

describe('NotFoundError', () => {
  it('extends ApiError', () => {
    expect(new NotFoundError()).toBeInstanceOf(ApiError)
  })

  it('has status 404, code NOT_FOUND, default message', () => {
    const err = new NotFoundError()
    expect(err.statusCode).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('Not found')
    expect(err.name).toBe('NotFoundError')
  })
})

describe('ConflictError', () => {
  it('extends ApiError', () => {
    expect(new ConflictError()).toBeInstanceOf(ApiError)
  })

  it('has status 409, code CONFLICT, default message', () => {
    const err = new ConflictError()
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe('CONFLICT')
    expect(err.message).toBe('Conflict')
    expect(err.name).toBe('ConflictError')
  })
})

describe('RateLimitError', () => {
  it('extends ApiError', () => {
    expect(new RateLimitError()).toBeInstanceOf(ApiError)
  })

  it('has status 429, code RATE_LIMITED, default message', () => {
    const err = new RateLimitError()
    expect(err.statusCode).toBe(429)
    expect(err.code).toBe('RATE_LIMITED')
    expect(err.message).toBe('Too many requests')
    expect(err.name).toBe('RateLimitError')
  })
})

describe('InvalidPasswordError', () => {
  it('extends ApiError', () => {
    expect(new InvalidPasswordError()).toBeInstanceOf(ApiError)
  })

  it('has status 401, code INVALID_PASSWORD, default message', () => {
    const err = new InvalidPasswordError()
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('INVALID_PASSWORD')
    expect(err.message).toBe('Invalid password')
    expect(err.name).toBe('InvalidPasswordError')
  })
})

describe('MfaRequiredError', () => {
  it('extends ApiError', () => {
    const err = new MfaRequiredError('mfa required', 'tok', ['totp'])
    expect(err).toBeInstanceOf(ApiError)
  })

  it('has status 401, code MFA_REQUIRED, default message', () => {
    const err = new MfaRequiredError('mfa required', 'tok', ['totp'])
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe('MFA_REQUIRED')
    expect(err.message).toBe('mfa required')
    expect(err.name).toBe('MfaRequiredError')
  })

  it('uses default message when omitted', () => {
    const err = new MfaRequiredError(undefined, 'tok', ['totp'])
    expect(err.message).toBe('MFA required')
  })

  it('carries mfaToken and methods payload', () => {
    const methods = ['totp', 'sms']
    const err = new MfaRequiredError('mfa required', 'token-abc', methods)
    expect(err.mfaToken).toBe('token-abc')
    expect(err.methods).toBe(methods)
    expect(err.methods).toEqual(['totp', 'sms'])
  })

  it('preserves the methods array reference passed in', () => {
    const methods = ['totp']
    const err = new MfaRequiredError('mfa required', 'tok', methods)
    expect(err.methods).toBe(methods)
    expect(err.mfaToken).toBe('tok')
  })
})
