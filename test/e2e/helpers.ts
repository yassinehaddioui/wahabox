import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import crypto from 'crypto'
import { execSync } from 'child_process'
import type { Page, BrowserContext } from '@playwright/test'

export function clearRateLimits() {
  try {
    execSync(
      'redis-cli EVAL \'for _,k in ipairs(redis.call("KEYS","rl:*")) do redis.call("DEL",k) end\' 0',
      { timeout: 3000 },
    )
  } catch {
    // Redis cleanup is best-effort
  }
}

/**
 * Create a user via the signup flow and return the username/password.
 * Used by tests that need a fresh user but don't need to test signup itself.
 */
export async function createUserViaUI(
  page: Page,
  prefix: string = 'e2e',
): Promise<{ username: string; password: string; recoveryCode: string }> {
  const username = `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'

  await page.goto('/signup')
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForSelector('text=Save Your Recovery Code')

  const recoveryCode = await page.locator('code').innerText()
  await page.getByRole('button', { name: "I've saved my recovery code" }).click()
  await page.fill('input[placeholder="Enter your recovery code"]', recoveryCode)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForURL('/login', { timeout: 15_000 })

  return { username, password, recoveryCode }
}

/**
 * Login via the UI and wait for dashboard.
 */
export async function loginViaUI(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('/dashboard')
}

/**
 * Full signup + login flow. Returns credentials for reuse.
 */
export async function signupAndLogin(
  page: Page,
  prefix: string = 'e2e',
): Promise<{ username: string; password: string; recoveryCode: string }> {
  const creds = await createUserViaUI(page, prefix)
  await loginViaUI(page, creds.username, creds.password)
  return creds
}

export function verifyEmailDirectly(username: string) {
  try {
    execSync(
      `docker exec wahabox-dev-postgres-1 psql -U postgres -d wahabox -c "UPDATE users SET \\"emailVerified\\" = true WHERE username = '${username}';"`,
      { timeout: 5000 },
    )
    execSync(
      'redis-cli EVAL \'for _,k in ipairs(redis.call("KEYS","verify:*")) do redis.call("DEL",k) end\' 0',
      { timeout: 3000 },
    )
    process.stderr.write(`[verify-email] verified email for user: ${username}\n`)
  } catch (e) {
    process.stderr.write(`[verify-email] FAILED: ${e}\n`)
  }
}

/**
 * Generate a Turnstile proof cookie and add it to the given browser context.
 * This bypasses the Turnstile CAPTCHA check on the server for e2e tests
 * that use fresh browser contexts (incognito) to submit drop messages.
 *
 * Uses the same HMAC-SHA256 signing as lib/turnstile.ts:createTurnstileProof().
 */
export async function addTurnstileProofCookie(context: BrowserContext) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return // Turnstile not configured, no cookie needed

  const payload = {
    p: 'turnstile' as const,
    iat: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64')
  const proofToken = `${encoded}.${signature}`

  await context.addCookies([{
    name: 'turnstile_proof',
    value: proofToken,
    domain: 'wahabox.localhost',
    path: '/',
    httpOnly: false,
    secure: false,
    sameSite: 'Strict' as const,
  }])
}
