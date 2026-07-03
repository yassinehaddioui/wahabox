import version from '../version.json'
import { getRequestContext } from '@/lib/request-context'

/**
 * Logger context — arbitrary key-value pairs merged into every log line.
 * Sensitive keys are automatically redacted (see REDACTED_KEYS below).
 */
export type LoggerContext = Record<string, unknown>

type Level = 'error' | 'warn' | 'info'

/**
 * Keys whose values are always replaced with '[redacted]' in log output.
 * We keep the key visible so operators know the field existed; the value
 * is never exposed. This prevents accidental secret leakage through ctx.
 */
const REDACTED_KEYS = new Set([
  'body',
  'cookie',
  'cookies',
  'authorization',
  'password',
  'accessToken',
  'csrfToken',
  'sessionToken',
])

function redactCtx(ctx: LoggerContext): LoggerContext {
  const result: LoggerContext = {}
  for (const [key, value] of Object.entries(ctx)) {
    result[key] = REDACTED_KEYS.has(key) ? '[redacted]' : value
  }
  return result
}

function serialize(level: Level, msgOrErr: string | Error, ctx?: LoggerContext): string {
  const ts = new Date().toISOString()
  const rc = getRequestContext()

  const line: Record<string, unknown> = {
    level,
    msg: typeof msgOrErr === 'string' ? msgOrErr : msgOrErr.message,
    ts,
    env: process.env.NODE_ENV ?? 'development',
    appMode: process.env.APP_ENV ?? process.env.APP_MODE ?? 'development',
    sha: version.sha ?? 'unknown',
  }

  // For Error inputs, also include name and stack
  if (msgOrErr instanceof Error) {
    line.name = msgOrErr.name
    line.stack = msgOrErr.stack
  }

  // Auto-derived fields from request context (only when present)
  if (rc) {
    if (rc.requestId !== undefined) line.requestId = rc.requestId
    if (rc.route !== undefined) line.route = rc.route
    if (rc.ip !== undefined) line.ip = rc.ip
  }

  // Caller-supplied context — merged AFTER auto-derived so caller keys win on collision
  if (ctx) {
    const safeCtx = redactCtx(ctx)
    for (const [k, v] of Object.entries(safeCtx)) {
      line[k] = v
    }
  }

  return JSON.stringify(line)
}

function log(level: Level, msgOrErr: string | Error, ctx?: LoggerContext): void {
  let line: string
  try {
    line = serialize(level, msgOrErr, ctx)
  } catch {
    // Serialization failed (e.g. circular reference in ctx) — write a fallback
    try {
      line = JSON.stringify({
        level,
        msg: '<serialize-failed>',
        ts: new Date().toISOString(),
        error: 'serialize-failed',
      })
    } catch {
      // Ultimate fallback — extremely unlikely, but logger must never throw
      return
    }
  }
  try {
    process.stdout.write(line + '\n')
  } catch {
    // swallow — logger never throws
  }
}

export const logger = {
  error(msg: string | Error, ctx?: LoggerContext): void {
    log('error', msg, ctx)
  },
  warn(msg: string, ctx?: LoggerContext): void {
    log('warn', msg, ctx)
  },
  info(msg: string, ctx?: LoggerContext): void {
    log('info', msg, ctx)
  },
}
