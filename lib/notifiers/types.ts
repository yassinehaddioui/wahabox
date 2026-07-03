/**
 * Error handling & reporting — pluggable notifier interface.
 *
 * Todo 5 of the error-handling-reporting plan: defines the types so
 * the reporter (Todo 4) and Discord transport (Todo 6) can import
 * them with zero runtime deps.
 *
 * No runtime code — interfaces/types only.
 */

/** Where the error originated. */
export type ErrorSource = 'server' | 'process' | 'client'

/** Severity level for routing / alert colouring. */
export type ErrorLevel = 'error' | 'warn' | 'info'

/** Structured error payload that every notifier receives. */
export interface ErrorEnvelope {
  signature: string
  code: string
  level: ErrorLevel
  message: string
  stackFirstFrame?: string
  route?: string
  requestId?: string
  ip?: string
  source: ErrorSource
  sha?: string
  ts: string
  env?: string
}

/** Pluggable transport. Implement this to add a sink (Discord,
 *  Sentry, Glitchtip, etc.) without touching the reporter core. */
export interface ErrorNotifier {
  notify(payload: ErrorEnvelope): Promise<void>
}
