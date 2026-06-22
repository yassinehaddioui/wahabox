import { test, expect } from '@playwright/test'
import { clearRateLimits } from './helpers'

test.beforeEach(() => clearRateLimits())

test('create box, drop message, and decrypt', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `msg_e2e_${crypto.randomUUID().slice(0, 8)}`
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
  await page.waitForURL('/login', { timeout: 10000 })

  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('/dashboard')

  await page.fill('input[placeholder="Box name"]', 'Test Box')
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForTimeout(1500)

  const dropLink = await page.locator('a[href^="/drop/"]').first().textContent()
  const slug = dropLink!.trim().replace('/drop/', '')

  const incognito = await browser.newContext()
  const dropPage = await incognito.newPage()
  await dropPage.goto(`/drop/${slug}`)
  await dropPage.waitForSelector('text=Send an encrypted message')
  await dropPage.locator('textarea').fill('This is a secret message!')
  await dropPage.getByRole('button', { name: 'Send Message' }).click()
  await dropPage.waitForSelector('text=Message Sent!')
  await incognito.close()

  await page.reload()
  await page.waitForTimeout(1500)

  await page.getByRole('link', { name: 'Test Box' }).click()
  await page.waitForURL(/\/dashboard\//)
  await expect(page.locator('text=1 message')).toBeVisible()

  await page.getByRole('button', { name: 'Decrypt message' }).click()
  await page.waitForTimeout(2000)
  await expect(page.locator('text=This is a secret message!')).toBeVisible()

  await context.close()
})
