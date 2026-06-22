import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateEnv } from '@/lib/env'

// Env keys this suite mutates. Saved in beforeEach and restored in afterEach
// so process.env is never permanently changed — test/setup.ts defaults survive.
const MANAGED_KEYS = [
  'DATABASE_URL',
  'SERVER_MASTER_SECRET',
  'SESSION_SECRET',
  'NODE_ENV',
] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const key of MANAGED_KEYS) {
    saved[key] = process.env[key]
  }
})

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = saved[key]
    }
  }
})

describe('validateEnv', () => {
  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL
    expect(() => validateEnv()).toThrow('Missing required environment variable: DATABASE_URL')
  })

  it('throws when SERVER_MASTER_SECRET is missing', () => {
    delete process.env.SERVER_MASTER_SECRET
    expect(() => validateEnv()).toThrow(
      'Missing required environment variable: SERVER_MASTER_SECRET',
    )
  })

  it('throws in production when SESSION_SECRET is the default', () => {
    process.env.NODE_ENV = 'production'
    process.env.SESSION_SECRET = 'dev-session-secret-change-in-production'
    expect(() => validateEnv()).toThrow(
      'SESSION_SECRET must be set to a unique value in production',
    )
  })

  it('accepts the default SESSION_SECRET in development', () => {
    process.env.NODE_ENV = 'development'
    process.env.SESSION_SECRET = 'dev-session-secret-change-in-production'
    expect(() => validateEnv()).not.toThrow()
  })
})
