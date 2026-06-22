import crypto from 'crypto'
import { TURNSTILE_PROOF_COOKIE } from './turnstile-constants'
export { TURNSTILE_PROOF_COOKIE }

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

let turnstileEnabled: boolean | null = null

function isEnabled(): boolean {
  if (turnstileEnabled !== null) return turnstileEnabled
  const hasKeys = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !!process.env.TURNSTILE_SECRET_KEY
  turnstileEnabled = hasKeys
  if (!hasKeys && process.env.NODE_ENV === 'production') {
    console.error('[turnstile] Turnstile keys are not configured in production')
  }
  return turnstileEnabled
}

export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  if (!isEnabled()) {
    if (process.env.NODE_ENV !== 'production') return true
    return false
  }

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
    const data = (await res.json()) as { success: boolean }
    return data.success === true
  } catch {
    return false
  }
}

function sign(data: string): string {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) throw new Error('TURNSTILE_SECRET_KEY is not set')
  return crypto.createHmac('sha256', secret).update(data).digest('base64')
}

const PROOF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function createTurnstileProof(): string {
  const payload = { p: 'turnstile' as const, iat: Date.now(), exp: Date.now() + PROOF_MAX_AGE_MS }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
  const signature = sign(encoded)
  return `${encoded}.${signature}`
}

export function verifyTurnstileProof(token: string | null): boolean {
  if (!token) return false
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return false
    const encoded = token.slice(0, dot)
    const signature = token.slice(dot + 1)
    const expected = sign(encoded)
    if (signature.length !== expected.length) return false
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
    if (
      payload.p !== 'turnstile' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    )
      return false
    if (Date.now() > payload.exp) return false
    return true
  } catch {
    return false
  }
}

export async function checkTurnstile(
  proofCookie: string | undefined,
  turnstileToken: string | null,
  ip: string,
): Promise<{ verified: boolean; setProofCookie: string | null }> {
  if (!isEnabled()) {
    if (process.env.NODE_ENV !== 'production') return { verified: true, setProofCookie: null }
    return { verified: false, setProofCookie: null }
  }

  if (proofCookie && verifyTurnstileProof(proofCookie)) {
    return { verified: true, setProofCookie: null }
  }

  const verified = await verifyTurnstile(turnstileToken, ip)
  if (!verified) return { verified: false, setProofCookie: null }

  const proofToken = createTurnstileProof()
  return { verified: true, setProofCookie: proofToken }
}
