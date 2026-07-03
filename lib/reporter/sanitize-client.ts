/**
 * Client-safe sanitizer — identical regex rules as the server `sanitize.ts` but
 * with ZERO node:crypto, ZERO server deps. Tree-shakeable into the client bundle.
 *
 * Applied to error messages and stack frames before they are POSTed to
 * `/api/report-error`.
 */
type PatternEntry = [RegExp, string]

const PATTERNS: readonly PatternEntry[] = [
  // Email addresses
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted]'],
  // JWT-shaped tokens (three base64url segments separated by dots)
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted]'],
  // Hex strings >= 16 characters (session tokens, keys)
  [/[0-9a-f]{16,}/gi, '[redacted]'],
  // Base64 strings >= 32 characters (ciphertext, encoded payloads)
  [/[A-Za-z0-9+/]{32,}={0,2}/g, '[redacted]'],
]

export function sanitizeStringClient(s: string): string {
  let result = s
  for (const [re, replacement] of PATTERNS) {
    result = result.replace(re, replacement)
  }
  return result
}
