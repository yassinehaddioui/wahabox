import { z } from 'zod'
import { BadRequestError } from './errors'

export const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric')

export const signupSchema = z.object({
  username: usernameSchema,
  csrfToken: z.string().optional(),
  turnstileToken: z.string().optional(),
  authVerifier: z.string().min(1),
  authSalt: z.string().min(1),
  publicKey: z.string().min(1),
  encPrivPw: z.string().min(1),
  pwKdfSalt: z.string().min(1),
  pwNonce: z.string().min(1),
  encPrivRec: z.string().min(1),
  recKdfSalt: z.string().min(1),
  recNonce: z.string().min(1),
})

export const loginSchema = z.object({
  username: usernameSchema,
  csrfToken: z.string().optional(),
  turnstileToken: z.string().optional(),
  authVerifier: z.string().min(1),
})

export const recoveryStartSchema = z.object({
  username: usernameSchema,
  csrfToken: z.string().optional(),
})

export const recoveryCompleteSchema = z.object({
  username: usernameSchema,
  csrfToken: z.string().optional(),
  newAuthVerifier: z.string().min(1),
  newAuthSalt: z.string().min(1),
  newEncPrivPw: z.string().min(1),
  newPwKdfSalt: z.string().min(1),
  newPwNonce: z.string().min(1),
})

export const createBoxSchema = z.object({
  label: z.string().min(1).max(128),
  greeting: z.string().max(500).nullable().optional(),
  csrfToken: z.string().optional(),
})

export const updateBoxSchema = z.object({
  label: z.string().min(1).max(128).optional(),
  greeting: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxMessages: z.number().int().positive().nullable().optional(),
  notify: z.boolean().optional(),
  rotateSlug: z.boolean().optional(),
  csrfToken: z.string().optional(),
})

export const submitMessageSchema = z.object({
  ciphertext: z.string().min(1),
  csrfToken: z.string().optional(),
  turnstileToken: z.string().optional(),
  challenge: z.string().optional(),
  nonce: z.string().optional(),
  difficulty: z.number().int().positive().optional(),
  honeypot: z.string().max(0, 'Bot detected').optional(),
})

export const mfaSendEmailSchema = z.object({
  mfaToken: z.string().min(1),
})

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1),
  method: z.enum(['email', 'totp', 'passkey']),
  code: z.string().optional(),
  assertion: z.any().optional(),
})

export const mfaRecoverSchema = z.object({
  mfaToken: z.string().min(1),
  recoveryCode: z.string().min(1),
})

export const mfaManageSchema = z.object({
  method: z.enum(['email', 'totp', 'passkey']),
  action: z.enum(['enable', 'disable', 'setup', 'confirm']),
  code: z.string().optional(),
  password: z.string().optional(),
  attestation: z.any().optional(),
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

  body = stripNulls(body)

  const result = schema.safeParse(body)
  if (!result.success) {
    throw new BadRequestError(result.error.issues[0]?.message ?? 'Validation failed')
  }

  return result.data
}

function stripNulls(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) return value.map(stripNulls)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null) out[k] = stripNulls(v)
    }
    return out
  }
  return value
}
