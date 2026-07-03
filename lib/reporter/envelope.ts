import crypto from 'node:crypto'
import version from '../../version.json'
import { getRequestContext } from '@/lib/request-context'
import { ApiError } from '@/lib/errors'
import { sanitizeString } from './sanitize'
import type { ErrorEnvelope, ErrorSource, ErrorLevel } from '@/lib/notifiers/types'

export type { ErrorEnvelope } from '@/lib/notifiers/types'

/**
 * Build a sanitized error envelope suitable for notifier dispatch.
 *
 * @param err   The thrown value — narrowed via instanceof for structured fields.
 * @param ctx   Optional overrides for envelope fields.  ctx wins over
 *              auto-detected values from `getRequestContext()`.
 */
export function buildEnvelope(
  err: unknown,
  ctx?: Partial<ErrorEnvelope>,
): ErrorEnvelope {
  let code: string
  let level: ErrorLevel
  let rawMessage: string

  if (err instanceof ApiError) {
    code = err.code ?? err.name
    level = err.statusCode >= 500 ? 'error' : 'warn'
    rawMessage = err.message
  } else if (err instanceof Error) {
    code = err.name
    level = 'error'
    rawMessage = err.message
  } else {
    code = 'unknown'
    level = 'error'
    rawMessage = String(err)
  }

  // Second line of the stack is the first frame after "Error: …"
  // For non-Error types err.stack is undefined, yielding empty string.
  const stackFirstFrame = sanitizeString(
    (err as Error).stack?.split('\n')[1]?.trim() ?? '',
  )

  const message = sanitizeString(rawMessage)

  // Read request context — ctx wins over auto-detected values on collision.
  const rc = getRequestContext()
  const requestId = ctx?.requestId ?? rc?.requestId
  const route = ctx?.route ?? rc?.route ?? 'unknown'
  const ip = ctx?.ip ?? rc?.ip

  const source: ErrorSource = ctx?.source ?? 'server'

  // Deterministic signature: 16 hex chars from SHA-256 of code|route|frame
  const signature = crypto
    .createHash('sha256')
    .update([code, route ?? 'unknown', stackFirstFrame ?? ''].join('|'))
    .digest('hex')
    .slice(0, 16)

  const ts = new Date().toISOString()
  const env = process.env.NODE_ENV ?? 'development'
  const sha = version.sha ?? 'unknown'

  const envelope: ErrorEnvelope = {
    signature,
    code,
    level,
    message,
    stackFirstFrame,
    route,
    source,
    sha,
    ts,
    env,
  }

  // Optional fields — only include when defined (omit undefined keys).
  if (requestId !== undefined) {
    envelope.requestId = requestId
  }
  if (ip !== undefined) {
    envelope.ip = ip
  }

  return envelope
}
