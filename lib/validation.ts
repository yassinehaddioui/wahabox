import { z } from 'zod'
import { BadRequestError } from './errors'

export const usernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, 'Username must be alphanumeric')

export const signupSchema = z.object({
  username: usernameSchema,
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
  authVerifier: z.string().min(1),
})

export const recoveryStartSchema = z.object({
  username: usernameSchema,
})

export const recoveryCompleteSchema = z.object({
  username: usernameSchema,
  newAuthVerifier: z.string().min(1),
  newAuthSalt: z.string().min(1),
  newEncPrivPw: z.string().min(1),
  newPwKdfSalt: z.string().min(1),
  newPwNonce: z.string().min(1),
})

export const createBoxSchema = z.object({
  label: z.string().min(1).max(128),
})

export const updateBoxSchema = z.object({
  label: z.string().min(1).max(128).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxMessages: z.number().int().positive().nullable().optional(),
  notify: z.boolean().optional(),
  rotateSlug: z.boolean().optional(),
})

export const submitMessageSchema = z.object({
  ciphertext: z.string().min(1),
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
