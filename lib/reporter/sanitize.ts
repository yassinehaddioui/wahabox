/**
 * Message sanitizer for error reporting.
 *
 * Applies forbidden regex patterns → replaces each match with '[redacted]'.
 * This prevents accidental PII leakage in Discord alerts and log lines.
 *
 * WHAT IS REDACTED:
 *   - Email addresses (e.g. alice@example.com)
 *   - JWT tokens (three segment base64url shape)
 *   - Hex tokens ≥ 16 characters (session IDs, API keys)
 *   - Base64 blobs ≥ 32 characters (ciphertext, encoded payloads)
 *
 * WHAT IS NOT REDACTED (NOT PII FOR OPS):
 *   - IP addresses — needed for rate-limit diagnostics and Geo-lookup
 *   - Usernames — displayed in Discord embeds for traceability
 *
 * Pure function, deterministic, no side effects.
 */

type PatternEntry = [RegExp, string]

const PATTERNS: readonly PatternEntry[] = [
  // Email addresses
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted]'],

  // JWT-shaped tokens (three base64url segments separated by dots)
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted]'],

  // Hex strings ≥ 16 characters (session tokens, keys)
  [/[0-9a-f]{16,}/gi, '[redacted]'],

  // Base64 strings ≥ 32 characters (ciphertext, encoded payloads)
  [/[A-Za-z0-9+/]{32,}={0,2}/g, '[redacted]'],
]

export function sanitizeString(s: string): string {
  let result = s
  for (const [re, replacement] of PATTERNS) {
    result = result.replace(re, replacement)
  }
  return result
}
