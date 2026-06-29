import { test, expect } from '@playwright/test'
import { clearRateLimits, verifyEmailDirectly } from './helpers'
import { generate } from 'otplib'

test.beforeEach(() => clearRateLimits())

test('add and verify email address', async ({ page }) => {
  const username = `set_e2e_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'
  const email = `test-${username}@wahabox.localhost`

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
  await page.waitForSelector('text=Email Notifications')

  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/@wahabox\.localhost/)).toBeVisible()

  await page.reload()
  await page.waitForSelector('text=Email Notifications')

  await expect(page.getByText(/@wahabox\.localhost/)).toBeVisible()
  await expect(page.getByText('Pending').first()).toBeVisible()

  verifyEmailDirectly(username)

  await page.reload()
  await page.waitForSelector('text=Email Notifications')

  await expect(page.getByText('Verified').first()).toBeVisible()
  await expect(page.getByText('Pending').first()).not.toBeVisible()
})

test('toggle email notifications', async ({ page }) => {
  const username = `set_e2e_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'
  const email = `test-${username}@wahabox.localhost`

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
  await page.waitForSelector('text=Email Notifications')

  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/@wahabox\.localhost/)).toBeVisible()

  verifyEmailDirectly(username)

  await page.reload()
  await page.waitForSelector('text=Email Notifications')

  const notifSwitch = page.locator('#notif-toggle')
  await expect(notifSwitch).toBeVisible()
  await expect(notifSwitch).toBeChecked()

  await notifSwitch.click()
  await expect(page.getByText('Notifications disabled')).toBeVisible()
  await expect(notifSwitch).not.toBeChecked()

  await notifSwitch.click()
  await expect(page.getByText('Notifications enabled')).toBeVisible()
  await expect(notifSwitch).toBeChecked()
})

test('remove email address', async ({ page }) => {
  const username = `set_e2e_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'
  const email = `test-${username}@wahabox.localhost`

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
  await page.waitForSelector('text=Email Notifications')

  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/@wahabox\.localhost/)).toBeVisible()

  verifyEmailDirectly(username)

  await page.reload()
  await page.waitForSelector('text=Email Notifications')

  await expect(page.getByText(/@wahabox\.localhost/)).toBeVisible()

  await page.getByRole('button', { name: 'Remove Email' }).click()
  await expect(page.getByText('Email removed')).toBeVisible()

  await expect(page.getByText(/@wahabox\.localhost/)).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
})

test('enable and disable email MFA', async ({ page }) => {
  const username = `set_e2e_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'
  const email = `test-${username}@wahabox.localhost`

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
  await page.waitForSelector('text=Email Notifications')

  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/@wahabox\.localhost/)).toBeVisible()

  verifyEmailDirectly(username)

  await page.reload()
  await page.waitForSelector('text=Email Notifications')

  await expect(page.getByText('Email 2FA')).toBeVisible()
  await page.getByRole('button', { name: 'Enable' }).click()

  await expect(page.getByRole('button', { name: 'Disable' }).first()).toBeVisible()
  await expect(page.getByText('Enabled')).toHaveCount(1)

  await page.getByRole('button', { name: 'Disable' }).first().click()

  await expect(page.getByRole('button', { name: 'Enable' })).toBeVisible()
  await expect(page.getByText('Enabled').first()).not.toBeVisible()
})

test('enable TOTP MFA setup and confirm', async ({ page }) => {
  const username = `set_e2e_${crypto.randomUUID().slice(0, 8)}`
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

  await page.goto('/settings')
  await page.waitForSelector('text=Authenticator App')

  await page.getByRole('button', { name: 'Setup' }).click()
  await page.waitForSelector('p.font-mono.text-xs')

  const secret = await page.locator('p.font-mono.text-xs').textContent()
  const totpCode = await generate({ secret: secret!.trim() })

  await page.locator('input[placeholder="000000"]').fill(totpCode)
  await page.getByRole('button', { name: 'Confirm' }).click()

  await page.waitForSelector('[role="dialog"] code')

  await expect(page.locator('[role="dialog"] code')).not.toHaveCount(0)
  await page.getByRole('button', { name: "I've saved my codes" }).click()

  await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  await expect(page.getByText('Authenticator App')).toBeVisible()
  await expect(page.getByText('Enabled')).toHaveCount(1)
})

test('view and copy MFA recovery codes', async ({ page }) => {
  const username = `set_e2e_${crypto.randomUUID().slice(0, 8)}`
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

  await page.goto('/settings')
  await page.waitForSelector('text=Authenticator App')

  await page.getByRole('button', { name: 'Setup' }).click()
  await page.waitForSelector('p.font-mono.text-xs')

  const secret = await page.locator('p.font-mono.text-xs').textContent()
  const totpCode = await generate({ secret: secret!.trim() })

  await page.locator('input[placeholder="000000"]').fill(totpCode)
  await page.getByRole('button', { name: 'Confirm' }).click()

  await page.waitForSelector('[role="dialog"] code')
  await page.getByRole('button', { name: "I've saved my codes" }).click()

  await page.waitForSelector('text=Recovery Codes')

  await page.getByRole('button', { name: 'Regenerate' }).click()
  await page.waitForSelector('[role="dialog"]')

  const codes = await page.locator('[role="dialog"] code').allTextContents()
  expect(codes.length).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Copy All' }).click()
  await expect(page.getByText('Recovery codes copied')).toBeVisible()

  await page.getByRole('button', { name: "I've saved my codes" }).click()
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()
})
