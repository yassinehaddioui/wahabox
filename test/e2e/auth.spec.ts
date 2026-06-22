import { test, expect } from '@playwright/test'
import { clearRateLimits } from './helpers'

test.beforeEach(() => clearRateLimits())

test('signup, login, and logout flow', async ({ page }) => {
  const username = `auth_e2e_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'

  await page.goto('/')
  await page.getByRole('link', { name: 'Create Account' }).click()
  await page.waitForURL('/signup')

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
  await expect(page.locator('h1')).toHaveText('Boxes')

  await page.getByRole('button', { name: 'Logout' }).click()
  await page.waitForURL('/login')

  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('/dashboard')
  await expect(page.locator('h1')).toHaveText('Boxes')
})
