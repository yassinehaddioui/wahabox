export const TURNSTILE_PROOF_COOKIE = 'turnstile_proof'

export function isTurnstileClientEnabled(): boolean {
  return typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
}
