import { test, expect } from '@playwright/test'
import { clearRateLimits } from './helpers'

test.beforeEach(() => clearRateLimits())

test('password change invalidates old session and old password', async ({ page }) => {
  const username = `pw_e2e_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'
  const newPassword = 'NewPassword456!'

  await page.goto('/signup')
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForSelector('text=Save Your Recovery Code')
  const recoveryCode = await page.locator('code').innerText()
  await page.getByRole('button', { name: "I've saved my recovery code" }).click()
  await page.fill('input[placeholder="Enter your recovery code"]', recoveryCode)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForURL('/login', { timeout: 10000 })

  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('/dashboard')

  await page.goto('/settings')
  await page.waitForSelector('text=Change Password')

  await page.fill('#current-password', password)
  await page.fill('#new-password', newPassword)
  await page.fill('#confirm-password', newPassword)
  await page.getByRole('button', { name: 'Change Password' }).click()

  await page.waitForURL('/login', { timeout: 10000 })

  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/login/)

  await page.fill('#username', username)
  await page.fill('#password', newPassword)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('/dashboard', { timeout: 10000 })
  await expect(page.locator('h1')).toHaveText('Boxes')
})
