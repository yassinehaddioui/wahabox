import { describe, it, expect } from 'vitest'
import {
  usernameSchema,
  signupSchema,
  loginSchema,
  recoveryStartSchema,
  recoveryCompleteSchema,
  createBoxSchema,
  updateBoxSchema,
  deleteBoxSchema,
  createVaultSchema,
  updateVaultSchema,
  deleteVaultSchema,
  createVaultItemSchema,
  updateVaultItemSchema,
  submitMessageSchema,
  mfaSendEmailSchema,
  mfaVerifySchema,
  mfaRecoverSchema,
  mfaManageSchema,
  parseBody,
} from '@/lib/validation'
import { BadRequestError } from '@/lib/errors'
import { createNextRequest } from '@/test/helpers/request'

// Shared valid primitives reused across schemas.
const validUsername = 'Alice_123'
const validCsrf = 'csrf-token'
const validTurnstile = 'turnstile-token'

describe('usernameSchema', () => {
  it('lowercases a valid alphanumeric username', () => {
    const result = usernameSchema.parse(validUsername)
    expect(result).toBe('alice_123')
  })

  it('accepts the minimum length (3 chars)', () => {
    expect(usernameSchema.parse('ABC')).toBe('abc')
  })

  it('accepts the maximum length (32 chars)', () => {
    const name = 'a'.repeat(32)
    expect(usernameSchema.parse(name)).toBe(name)
  })

  it('rejects a username shorter than 3 chars', () => {
    expect(usernameSchema.safeParse('ab').success).toBe(false)
  })

  it('rejects a username longer than 32 chars', () => {
    expect(usernameSchema.safeParse('a'.repeat(33)).success).toBe(false)
  })

  it('rejects non-alphanumeric characters', () => {
    expect(usernameSchema.safeParse('alice-doe').success).toBe(false)
    expect(usernameSchema.safeParse('alice@doe').success).toBe(false)
    expect(usernameSchema.safeParse('alice.doe').success).toBe(false)
  })

  it('rejects a non-string value', () => {
    expect(usernameSchema.safeParse(123).success).toBe(false)
  })
})

describe('signupSchema', () => {
  const validSignup = {
    username: validUsername,
    authVerifier: 'verifier',
    authSalt: 'salt',
    publicKey: 'pub',
    publicKeySign: 'pubsign',
    encPrivPw: 'encpw',
    pwKdfSalt: 'pwkdf',
    pwNonce: 'pwnonce',
    encPrivRec: 'encrec',
    recKdfSalt: 'reckdf',
    recNonce: 'recnonce',
  }

  it('parses a valid signup payload and lowercases the username', () => {
    const result = signupSchema.parse(validSignup)
    expect(result.username).toBe('alice_123')
    expect(result.authVerifier).toBe('verifier')
  })

  it('accepts optional csrfToken and turnstileToken', () => {
    const result = signupSchema.parse({
      ...validSignup,
      csrfToken: validCsrf,
      turnstileToken: validTurnstile,
    })
    expect(result.csrfToken).toBe(validCsrf)
    expect(result.turnstileToken).toBe(validTurnstile)
  })

  it('accepts null csrfToken and turnstileToken', () => {
    const result = signupSchema.parse({
      ...validSignup,
      csrfToken: null,
      turnstileToken: null,
    })
    expect(result.csrfToken).toBeNull()
    expect(result.turnstileToken).toBeNull()
  })

  it('rejects when a required crypto field is missing', () => {
    const { publicKey: _omit, ...missing } = validSignup
    expect(signupSchema.safeParse(missing).success).toBe(false)
  })

  it('rejects an empty required string field', () => {
    expect(signupSchema.safeParse({ ...validSignup, authSalt: '' }).success).toBe(false)
  })

  it('rejects an invalid username', () => {
    expect(signupSchema.safeParse({ ...validSignup, username: 'no' }).success).toBe(false)
  })
})

describe('loginSchema', () => {
  const validLogin = {
    username: validUsername,
    authVerifier: 'verifier',
  }

  it('parses a valid login payload and lowercases the username', () => {
    const result = loginSchema.parse(validLogin)
    expect(result.username).toBe('alice_123')
    expect(result.authVerifier).toBe('verifier')
  })

  it('accepts optional csrfToken and turnstileToken', () => {
    const result = loginSchema.parse({
      ...validLogin,
      csrfToken: validCsrf,
      turnstileToken: validTurnstile,
    })
    expect(result.csrfToken).toBe(validCsrf)
  })

  it('rejects a missing authVerifier', () => {
    expect(loginSchema.safeParse({ username: validUsername }).success).toBe(false)
  })

  it('rejects an empty authVerifier', () => {
    expect(loginSchema.safeParse({ ...validLogin, authVerifier: '' }).success).toBe(false)
  })

  it('rejects an invalid username', () => {
    expect(loginSchema.safeParse({ ...validLogin, username: '!!' }).success).toBe(false)
  })
})

describe('recoveryStartSchema', () => {
  it('parses a valid payload and lowercases the username', () => {
    const result = recoveryStartSchema.parse({ username: validUsername })
    expect(result.username).toBe('alice_123')
  })

  it('accepts an optional csrfToken', () => {
    const result = recoveryStartSchema.parse({
      username: validUsername,
      csrfToken: validCsrf,
    })
    expect(result.csrfToken).toBe(validCsrf)
  })

  it('rejects a missing username', () => {
    expect(recoveryStartSchema.safeParse({}).success).toBe(false)
  })

  it('rejects an invalid username', () => {
    expect(recoveryStartSchema.safeParse({ username: 'a' }).success).toBe(false)
  })
})

describe('recoveryCompleteSchema', () => {
  const validRecovery = {
    username: validUsername,
    recoveryToken: 'token',
    decryptedChallenge: 'challenge',
    newAuthVerifier: 'newverifier',
    newAuthSalt: 'newsalt',
    newEncPrivPw: 'newencpw',
    newPwKdfSalt: 'newpwkdf',
    newPwNonce: 'newpwnonce',
    newPublicKeySign: 'newpubsign',
    newEncPrivSignPw: 'newencsignpw',
    newSignNoncePw: 'newsignnoncepw',
  }

  it('parses a valid payload and lowercases the username', () => {
    const result = recoveryCompleteSchema.parse(validRecovery)
    expect(result.username).toBe('alice_123')
    expect(result.recoveryToken).toBe('token')
  })

  it('accepts an optional csrfToken', () => {
    const result = recoveryCompleteSchema.parse({
      ...validRecovery,
      csrfToken: validCsrf,
    })
    expect(result.csrfToken).toBe(validCsrf)
  })

  it('rejects when a required new-* field is missing', () => {
    const { newAuthSalt: _omit, ...missing } = validRecovery
    expect(recoveryCompleteSchema.safeParse(missing).success).toBe(false)
  })

  it('rejects an empty recoveryToken', () => {
    expect(recoveryCompleteSchema.safeParse({ ...validRecovery, recoveryToken: '' }).success).toBe(
      false,
    )
  })

  it('rejects an invalid username', () => {
    expect(recoveryCompleteSchema.safeParse({ ...validRecovery, username: '!' }).success).toBe(
      false,
    )
  })
})

describe('createBoxSchema', () => {
  it('parses a minimal valid payload (label only)', () => {
    const result = createBoxSchema.parse({ label: 'My Box' })
    expect(result.label).toBe('My Box')
    expect(result.greeting).toBeUndefined()
  })

  it('accepts greeting, password, and csrfToken', () => {
    const result = createBoxSchema.parse({
      label: 'My Box',
      greeting: 'Hello',
      password: 'secret',
      csrfToken: validCsrf,
    })
    expect(result.greeting).toBe('Hello')
    expect(result.password).toBe('secret')
  })

  it('accepts null greeting and password', () => {
    const result = createBoxSchema.parse({
      label: 'My Box',
      greeting: null,
      password: null,
    })
    expect(result.greeting).toBeNull()
    expect(result.password).toBeNull()
  })

  it('rejects an empty label', () => {
    expect(createBoxSchema.safeParse({ label: '' }).success).toBe(false)
  })

  it('rejects a label longer than 128 chars', () => {
    expect(createBoxSchema.safeParse({ label: 'x'.repeat(129) }).success).toBe(false)
  })

  it('rejects a greeting longer than 500 chars', () => {
    expect(createBoxSchema.safeParse({ label: 'ok', greeting: 'g'.repeat(501) }).success).toBe(
      false,
    )
  })

  it('rejects a missing label', () => {
    expect(createBoxSchema.safeParse({ greeting: 'hi' }).success).toBe(false)
  })
})

describe('updateBoxSchema', () => {
  it('parses an empty object (all fields optional)', () => {
    const result = updateBoxSchema.parse({})
    expect(result.label).toBeUndefined()
  })

  it('parses a full valid update payload', () => {
    const result = updateBoxSchema.parse({
      label: 'Updated',
      greeting: 'Hi',
      isActive: true,
      expiresAt: '2026-12-31T00:00:00.000Z',
      maxMessages: 10,
      notify: false,
      rotateSlug: true,
      password: 'newpw',
      csrfToken: validCsrf,
    })
    expect(result.label).toBe('Updated')
    expect(result.maxMessages).toBe(10)
    expect(result.rotateSlug).toBe(true)
  })

  it('accepts null for nullable optional fields', () => {
    const result = updateBoxSchema.parse({
      greeting: null,
      expiresAt: null,
      maxMessages: null,
      password: null,
    })
    expect(result.greeting).toBeNull()
    expect(result.expiresAt).toBeNull()
    expect(result.maxMessages).toBeNull()
    expect(result.password).toBeNull()
  })

  it('rejects an empty label when provided', () => {
    expect(updateBoxSchema.safeParse({ label: '' }).success).toBe(false)
  })

  it('rejects a label longer than 128 chars', () => {
    expect(updateBoxSchema.safeParse({ label: 'x'.repeat(129) }).success).toBe(false)
  })

  it('rejects an invalid ISO datetime for expiresAt', () => {
    expect(updateBoxSchema.safeParse({ expiresAt: 'not-a-date' }).success).toBe(false)
  })

  it('rejects a non-positive maxMessages', () => {
    expect(updateBoxSchema.safeParse({ maxMessages: 0 }).success).toBe(false)
    expect(updateBoxSchema.safeParse({ maxMessages: -5 }).success).toBe(false)
  })

  it('rejects a non-integer maxMessages', () => {
    expect(updateBoxSchema.safeParse({ maxMessages: 1.5 }).success).toBe(false)
  })

  it('rejects a non-boolean isActive', () => {
    expect(updateBoxSchema.safeParse({ isActive: 'yes' }).success).toBe(false)
  })
})

describe('deleteBoxSchema', () => {
  it('parses an empty object', () => {
    const result = deleteBoxSchema.parse({})
    expect(result.csrfToken).toBeUndefined()
  })

  it('accepts a csrfToken', () => {
    const result = deleteBoxSchema.parse({ csrfToken: validCsrf })
    expect(result.csrfToken).toBe(validCsrf)
  })

  it('accepts a null csrfToken', () => {
    const result = deleteBoxSchema.parse({ csrfToken: null })
    expect(result.csrfToken).toBeNull()
  })

  it('rejects a non-string csrfToken', () => {
    expect(deleteBoxSchema.safeParse({ csrfToken: 123 }).success).toBe(false)
  })
})

describe('createVaultSchema', () => {
  it('parses a valid label', () => {
    const result = createVaultSchema.parse({ label: 'My Vault' })
    expect(result.label).toBe('My Vault')
  })

  it('accepts an optional csrfToken', () => {
    const result = createVaultSchema.parse({
      label: 'My Vault',
      csrfToken: 'csrf-token',
    })
    expect(result.csrfToken).toBe('csrf-token')
  })

  it('rejects an empty label', () => {
    expect(createVaultSchema.safeParse({ label: '' }).success).toBe(false)
  })

  it('rejects a label longer than 128 chars', () => {
    expect(createVaultSchema.safeParse({ label: 'x'.repeat(129) }).success).toBe(false)
  })

  it('rejects a missing label', () => {
    expect(createVaultSchema.safeParse({}).success).toBe(false)
  })
})

describe('updateVaultSchema', () => {
  it('parses when label is present', () => {
    const result = updateVaultSchema.parse({ label: 'Updated Vault' })
    expect(result.label).toBe('Updated Vault')
  })

  it('parses an empty object (all fields optional)', () => {
    const result = updateVaultSchema.parse({})
    expect(result.label).toBeUndefined()
  })

  it('accepts an optional csrfToken', () => {
    const result = updateVaultSchema.parse({
      label: 'Vault',
      csrfToken: 'csrf-token',
    })
    expect(result.csrfToken).toBe('csrf-token')
  })

  it('rejects an empty label when provided', () => {
    expect(updateVaultSchema.safeParse({ label: '' }).success).toBe(false)
  })

  it('rejects a label longer than 128 chars', () => {
    expect(updateVaultSchema.safeParse({ label: 'x'.repeat(129) }).success).toBe(false)
  })
})

describe('deleteVaultSchema', () => {
  it('parses an empty object', () => {
    const result = deleteVaultSchema.parse({})
    expect(result.csrfToken).toBeUndefined()
  })

  it('accepts a csrfToken', () => {
    const result = deleteVaultSchema.parse({ csrfToken: 'csrf-token' })
    expect(result.csrfToken).toBe('csrf-token')
  })
})

describe('createVaultItemSchema', () => {
  it('parses valid ciphertext strings', () => {
    const result = createVaultItemSchema.parse({
      ciphertextTitle: 'encrypted-title',
      ciphertextBody: 'encrypted-body',
    })
    expect(result.ciphertextTitle).toBe('encrypted-title')
    expect(result.ciphertextBody).toBe('encrypted-body')
  })

  it('accepts an optional csrfToken', () => {
    const result = createVaultItemSchema.parse({
      ciphertextTitle: 'title',
      ciphertextBody: 'body',
      csrfToken: 'csrf-token',
    })
    expect(result.csrfToken).toBe('csrf-token')
  })

  it('rejects an empty ciphertextTitle', () => {
    expect(
      createVaultItemSchema.safeParse({ ciphertextTitle: '', ciphertextBody: 'body' }).success,
    ).toBe(false)
  })

  it('rejects an empty ciphertextBody', () => {
    expect(
      createVaultItemSchema.safeParse({ ciphertextTitle: 'title', ciphertextBody: '' }).success,
    ).toBe(false)
  })

  it('rejects ciphertextTitle longer than 50_000 chars', () => {
    expect(
      createVaultItemSchema.safeParse({
        ciphertextTitle: 'x'.repeat(50_001),
        ciphertextBody: 'body',
      }).success,
    ).toBe(false)
  })

  it('rejects ciphertextBody longer than 200_000 chars', () => {
    expect(
      createVaultItemSchema.safeParse({
        ciphertextTitle: 'title',
        ciphertextBody: 'x'.repeat(200_001),
      }).success,
    ).toBe(false)
  })

  it('rejects a missing ciphertextTitle', () => {
    expect(createVaultItemSchema.safeParse({ ciphertextBody: 'body' }).success).toBe(false)
  })

  it('rejects a missing ciphertextBody', () => {
    expect(createVaultItemSchema.safeParse({ ciphertextTitle: 'title' }).success).toBe(false)
  })
})

describe('updateVaultItemSchema', () => {
  it('parses when ciphertextTitle is present alone', () => {
    const result = updateVaultItemSchema.parse({ ciphertextTitle: 'new-title' })
    expect(result.ciphertextTitle).toBe('new-title')
    expect(result.ciphertextBody).toBeUndefined()
  })

  it('parses when ciphertextBody is present alone', () => {
    const result = updateVaultItemSchema.parse({ ciphertextBody: 'new-body' })
    expect(result.ciphertextBody).toBe('new-body')
    expect(result.ciphertextTitle).toBeUndefined()
  })

  it('parses when both fields are present', () => {
    const result = updateVaultItemSchema.parse({
      ciphertextTitle: 'title',
      ciphertextBody: 'body',
    })
    expect(result.ciphertextTitle).toBe('title')
    expect(result.ciphertextBody).toBe('body')
  })

  it('rejects when both fields are missing (refine)', () => {
    expect(updateVaultItemSchema.safeParse({}).success).toBe(false)
  })

  it('rejects an empty ciphertextTitle when provided', () => {
    expect(updateVaultItemSchema.safeParse({ ciphertextTitle: '' }).success).toBe(false)
  })

  it('rejects ciphertextTitle longer than 50_000 chars', () => {
    expect(updateVaultItemSchema.safeParse({ ciphertextTitle: 'x'.repeat(50_001) }).success).toBe(
      false,
    )
  })

  it('accepts an optional csrfToken', () => {
    const result = updateVaultItemSchema.parse({
      ciphertextTitle: 'title',
      csrfToken: 'csrf-token',
    })
    expect(result.csrfToken).toBe('csrf-token')
  })
})

describe('submitMessageSchema', () => {
  it('parses a minimal valid message (ciphertext only)', () => {
    const result = submitMessageSchema.parse({ ciphertext: 'encrypted' })
    expect(result.ciphertext).toBe('encrypted')
  })

  it('accepts all optional fields', () => {
    const result = submitMessageSchema.parse({
      ciphertext: 'encrypted',
      csrfToken: validCsrf,
      turnstileToken: validTurnstile,
      challenge: 'challenge',
      nonce: 'nonce',
      password: 'pw',
    })
    expect(result.challenge).toBe('challenge')
    expect(result.nonce).toBe('nonce')
  })

  it('accepts a null honeypot (no bot)', () => {
    const result = submitMessageSchema.parse({
      ciphertext: 'encrypted',
      honeypot: null,
    })
    expect(result.honeypot).toBeNull()
  })

  it('accepts an undefined honeypot', () => {
    const result = submitMessageSchema.parse({ ciphertext: 'encrypted' })
    expect(result.honeypot).toBeUndefined()
  })

  it('rejects an empty ciphertext', () => {
    expect(submitMessageSchema.safeParse({ ciphertext: '' }).success).toBe(false)
  })

  it('rejects a ciphertext longer than 200_000 chars', () => {
    expect(submitMessageSchema.safeParse({ ciphertext: 'x'.repeat(200_001) }).success).toBe(false)
  })

  it('rejects a non-empty honeypot (bot detected)', () => {
    expect(submitMessageSchema.safeParse({ ciphertext: 'ok', honeypot: 'filled' }).success).toBe(
      false,
    )
  })

  it('rejects a missing ciphertext', () => {
    expect(submitMessageSchema.safeParse({}).success).toBe(false)
  })
})

describe('mfaSendEmailSchema', () => {
  it('parses a valid mfaToken', () => {
    const result = mfaSendEmailSchema.parse({ mfaToken: 'token' })
    expect(result.mfaToken).toBe('token')
  })

  it('rejects an empty mfaToken', () => {
    expect(mfaSendEmailSchema.safeParse({ mfaToken: '' }).success).toBe(false)
  })

  it('rejects a missing mfaToken', () => {
    expect(mfaSendEmailSchema.safeParse({}).success).toBe(false)
  })
})

describe('mfaVerifySchema', () => {
  it('parses a valid email verification', () => {
    const result = mfaVerifySchema.parse({
      mfaToken: 'token',
      method: 'email',
      code: '123456',
    })
    expect(result.method).toBe('email')
    expect(result.code).toBe('123456')
  })

  it('parses a valid totp verification without code', () => {
    const result = mfaVerifySchema.parse({
      mfaToken: 'token',
      method: 'totp',
    })
    expect(result.method).toBe('totp')
    expect(result.code).toBeUndefined()
  })

  it('parses a valid passkey verification with assertion', () => {
    const result = mfaVerifySchema.parse({
      mfaToken: 'token',
      method: 'passkey',
      assertion: { id: 'cred-id' },
    })
    expect(result.method).toBe('passkey')
    expect(result.assertion).toEqual({ id: 'cred-id' })
  })

  it('rejects an invalid method enum', () => {
    expect(mfaVerifySchema.safeParse({ mfaToken: 'token', method: 'sms' }).success).toBe(false)
  })

  it('rejects an empty mfaToken', () => {
    expect(mfaVerifySchema.safeParse({ mfaToken: '', method: 'email' }).success).toBe(false)
  })

  it('rejects a missing method', () => {
    expect(mfaVerifySchema.safeParse({ mfaToken: 'token' }).success).toBe(false)
  })
})

describe('mfaRecoverSchema', () => {
  it('parses a valid recovery payload', () => {
    const result = mfaRecoverSchema.parse({
      mfaToken: 'token',
      recoveryCode: 'code',
    })
    expect(result.mfaToken).toBe('token')
    expect(result.recoveryCode).toBe('code')
  })

  it('rejects an empty mfaToken', () => {
    expect(mfaRecoverSchema.safeParse({ mfaToken: '', recoveryCode: 'code' }).success).toBe(false)
  })

  it('rejects an empty recoveryCode', () => {
    expect(mfaRecoverSchema.safeParse({ mfaToken: 'token', recoveryCode: '' }).success).toBe(false)
  })

  it('rejects a missing recoveryCode', () => {
    expect(mfaRecoverSchema.safeParse({ mfaToken: 'token' }).success).toBe(false)
  })
})

describe('mfaManageSchema', () => {
  it('parses a valid enable action', () => {
    const result = mfaManageSchema.parse({
      method: 'totp',
      action: 'enable',
      code: '123456',
    })
    expect(result.action).toBe('enable')
  })

  it('parses a valid setup action with password', () => {
    const result = mfaManageSchema.parse({
      method: 'passkey',
      action: 'setup',
      password: 'pw',
      attestation: { challenge: 'x' },
    })
    expect(result.method).toBe('passkey')
    expect(result.attestation).toEqual({ challenge: 'x' })
  })

  it('parses a valid disable action with no optional fields', () => {
    const result = mfaManageSchema.parse({
      method: 'email',
      action: 'disable',
    })
    expect(result.code).toBeUndefined()
    expect(result.password).toBeUndefined()
  })

  it('rejects an invalid method enum', () => {
    expect(mfaManageSchema.safeParse({ method: 'sms', action: 'enable' }).success).toBe(false)
  })

  it('rejects an invalid action enum', () => {
    expect(mfaManageSchema.safeParse({ method: 'totp', action: 'delete' }).success).toBe(false)
  })

  it('rejects a missing method', () => {
    expect(mfaManageSchema.safeParse({ action: 'enable' }).success).toBe(false)
  })

  it('rejects a missing action', () => {
    expect(mfaManageSchema.safeParse({ method: 'totp' }).success).toBe(false)
  })
})

describe('parseBody', () => {
  it('returns parsed data for a valid JSON body', async () => {
    const request = createNextRequest('http://localhost/api/login', {
      method: 'POST',
      body: { username: validUsername, authVerifier: 'verifier' },
    })

    const result = await parseBody(request, loginSchema)
    expect(result.username).toBe('alice_123')
    expect(result.authVerifier).toBe('verifier')
  })

  it('throws BadRequestError when the body is not valid JSON', async () => {
    // Build a request with a non-JSON body manually so request.json() rejects.
    const request = new Request('http://localhost/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{',
    })

    await expect(parseBody(request, loginSchema)).rejects.toThrow(BadRequestError)
  })

  it('throws BadRequestError when the body fails schema validation', async () => {
    const request = createNextRequest('http://localhost/api/login', {
      method: 'POST',
      body: { username: 'no', authVerifier: 'verifier' },
    })

    await expect(parseBody(request, loginSchema)).rejects.toThrow(BadRequestError)
  })

  it('throws BadRequestError with a validation message on schema failure', async () => {
    const request = createNextRequest('http://localhost/api/login', {
      method: 'POST',
      body: { username: 'no' },
    })

    await expect(parseBody(request, loginSchema)).rejects.toThrow(
      /expected string to have >=3 characters/,
    )
  })

  it('throws BadRequestError "Invalid JSON body" when body is empty', async () => {
    const request = new Request('http://localhost/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    })

    await expect(parseBody(request, loginSchema)).rejects.toThrow('Invalid JSON body')
  })

  it('returns parsed data for a createBox payload via parseBody', async () => {
    const request = createNextRequest('http://localhost/api/boxes', {
      method: 'POST',
      body: { label: 'My Box', csrfToken: validCsrf },
    })

    const result = await parseBody(request, createBoxSchema)
    expect(result.label).toBe('My Box')
    expect(result.csrfToken).toBe(validCsrf)
  })
})
