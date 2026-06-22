import { test, expect } from '@playwright/test'
import { clearRateLimits } from './helpers'

test.beforeEach(() => clearRateLimits())

test('account recovery with recovery code', async ({ page }) => {
  const username = `rec_e2e_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'
  const newPassword = 'RecoveredPass789!'

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

  await page.goto('/recover')
  await page.waitForSelector('text=Recover Account')

  await page.fill('#username', username)
  await page.fill('#recoveryCode', recoveryCode)
  await page.fill('#newPassword', newPassword)
  await page.getByRole('button', { name: 'Recover Account' }).click()

  await page.waitForSelector('text=Password Updated!')
  await page.waitForURL('/login', { timeout: 10000 })

  await page.fill('#username', username)
  await page.fill('#password', newPassword)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('/dashboard', { timeout: 10000 })
  await expect(page.locator('h1')).toHaveText('Boxes')
})
