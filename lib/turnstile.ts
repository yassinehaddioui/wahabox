const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

let turnstileEnabled: boolean | null = null

function isEnabled(): boolean {
  if (turnstileEnabled !== null) return turnstileEnabled
  const hasKeys = !!process.env.TURNSTILE_SITE_KEY && !!process.env.TURNSTILE_SECRET_KEY
  turnstileEnabled = hasKeys
  return turnstileEnabled
}

export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  if (!isEnabled()) return true

  if (!token) return false

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    })
    const data = await res.json() as { success: boolean }
    return data.success === true
  } catch {
    return false
  }
}
