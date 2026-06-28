import { z } from 'zod'
import { BadRequestError } from './errors'

export const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric')
  .transform((u) => u.toLowerCase())

export const signupSchema = z.object({
  username: usernameSchema,
  csrfToken: z.string().nullish(),
  turnstileToken: z.string().nullish(),
  authVerifier: z.string().min(1),
  authSalt: z.string().min(1),
  publicKey: z.string().min(1),
  publicKeySign: z.string().min(1),
  encPrivPw: z.string().min(1),
  pwKdfSalt: z.string().min(1),
  pwNonce: z.string().min(1),
  encPrivRec: z.string().min(1),
  recKdfSalt: z.string().min(1),
  recNonce: z.string().min(1),
  encPrivSignPw: z.string().nullish(),
  signNoncePw: z.string().nullish(),
})

export const loginSchema = z.object({
  username: usernameSchema,
  csrfToken: z.string().nullish(),
  turnstileToken: z.string().nullish(),
  authVerifier: z.string().min(1),
})

export const recoveryStartSchema = z.object({
  username: usernameSchema,
  csrfToken: z.string().nullish(),
})

export const recoveryCompleteSchema = z.object({
  username: usernameSchema,
  csrfToken: z.string().nullish(),
  recoveryToken: z.string().min(1),
  decryptedChallenge: z.string().min(1),
  newAuthVerifier: z.string().min(1),
  newAuthSalt: z.string().min(1),
  newEncPrivPw: z.string().min(1),
  newPwKdfSalt: z.string().min(1),
  newPwNonce: z.string().min(1),
  newPublicKeySign: z.string().min(1).optional(),
  newEncPrivSignPw: z.string().min(1).optional(),
  newSignNoncePw: z.string().min(1).optional(),
})

export const createBoxSchema = z.object({
  label: z.string().min(1).max(128),
  greeting: z.string().max(500).nullable().optional(),
  password: z.string().min(1).max(128).nullable().optional(),
  csrfToken: z.string().nullish(),
})

export const updateBoxSchema = z.object({
  label: z.string().min(1).max(128).optional(),
  greeting: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxMessages: z.number().int().positive().nullable().optional(),
  notify: z.boolean().optional(),
  rotateSlug: z.boolean().optional(),
  password: z.string().min(1).max(128).nullable().optional(),
  csrfToken: z.string().nullish(),
})

export const deleteBoxSchema = z.object({
  csrfToken: z.string().nullish(),
})

export const submitMessageSchema = z.object({
  ciphertext: z.string().min(1).max(200_000),
  csrfToken: z.string().nullish(),
  turnstileToken: z.string().nullish(),
  challenge: z.string().nullish(),
  nonce: z.string().nullish(),
  password: z.string().nullish(),
  honeypot: z.string().max(0, 'Bot detected').nullish(),
})

export const mfaSendEmailSchema = z.object({
  mfaToken: z.string().min(1),
})

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  method: z.enum(['email', 'totp', 'passkey']),
  code: z.string().nullish(),
  assertion: z.any().optional(),
})

export const mfaRecoverSchema = z.object({
  mfaToken: z.string().min(1),
  recoveryCode: z.string().min(1),
})

export const mfaManageSchema = z.object({
  method: z.enum(['email', 'totp', 'passkey']),
  action: z.enum(['enable', 'disable', 'setup', 'confirm']),
  code: z.string().nullish(),
  password: z.string().nullish(),
  attestation: z.any().optional(),
})

export const createSecureMessageSchema = z.object({
  ciphertext: z.string().min(1).max(200_000),
  msgNonce: z.string().min(1),
  urlFragment: z.string().min(1),
  passwordHash: z.string().nullish(),
  passwordSalt: z.string().nullish(),
  receiverEmail: z.string().email().nullish(),
  startDate: z.string().datetime().nullish(),
  endDate: z.string().datetime().nullish(),
  autoDestruct: z.boolean(),
  signature: z.string().nullish(),
  senderPublicKeySign: z.string().nullish(),
  csrfToken: z.string().nullish(),
})

export const revealSecureMessageSchema = z.object({
  password: z.string().nullish(),
})

export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new BadRequestError('Invalid JSON body')
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    throw new BadRequestError(result.error.issues[0]?.message ?? 'Validation failed')
  }

  return result.data
}
