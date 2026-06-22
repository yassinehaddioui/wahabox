import { test, expect } from '@playwright/test'
import { clearRateLimits } from './helpers'

test.beforeEach(() => clearRateLimits())
import { generate } from 'otplib'

test('MFA enrollment with TOTP and recovery code bypass', async ({ page }) => {
  const username = `mfa_e2e_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'

  await page.goto('/signup')
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForSelector('text=Save Your Recovery Code')
  const signupRecoveryCode = await page.locator('code').innerText()
  await page.getByRole('button', { name: "I've saved my recovery code" }).click()
  await page.fill('input[placeholder="Enter your recovery code"]', signupRecoveryCode)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForURL('/login', { timeout: 10000 })

  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('/dashboard')

  await page.goto('/settings')
  await page.waitForSelector('text=Authenticator App')

  await page.getByRole('button', { name: 'Setup' }).click()
  await page.waitForTimeout(500)

  const secret = await page.locator('p.font-mono.text-xs').textContent()
  const totpCode = await generate({ secret: secret!.trim() })

  await page.locator('input[placeholder="000000"]').fill(totpCode)
  await page.getByRole('button', { name: 'Confirm' }).click()

  await page.waitForSelector('text=Recovery Codes')
  await page.waitForTimeout(500)

  const recoveryCodes = await page.locator('[role="dialog"] code').allTextContents()
  await page.getByRole('button', { name: "I've saved my codes" }).click()

  await page.getByRole('button', { name: 'Logout' }).click()
  await page.waitForURL('/login')

  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForSelector('text=Verify Your Identity')

  const totpCode2 = await generate({ secret: secret!.trim() })
  const totpInput = page.locator('input[placeholder="000000"]')
  await totpInput.fill(totpCode2)
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.waitForURL('/dashboard', { timeout: 15000 })
  await expect(page.locator('h1')).toHaveText('Boxes')

  await page.getByRole('button', { name: 'Logout' }).click()
  await page.waitForURL('/login')

  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForSelector('text=Verify Your Identity')

  await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
  await page.fill('#recovery-code', recoveryCodes[0])
  await page.getByRole('button', { name: 'Verify' }).click()
  await page.waitForURL('/dashboard', { timeout: 15000 })
  await expect(page.locator('h1')).toHaveText('Boxes')
})
