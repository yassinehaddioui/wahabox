import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { clearRateLimits } from './helpers'

test.beforeEach(() => clearRateLimits())

const TEST_PASSWORD = 'TestPassword123!'

/** Sign up a new user, verify recovery code, then log in. */
async function signupAndLogin(page: Page, username: string) {
  // Signup
  await page.goto('/signup')
  await page.fill('#username', username)
  await page.fill('#password', TEST_PASSWORD)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForSelector('text=Save Your Recovery Code')

  const recoveryCode = await page.locator('code').innerText()
  await page.getByRole('button', { name: "I've saved my recovery code" }).click()
  await page.fill('input[placeholder="Enter your recovery code"]', recoveryCode)
  await page.getByRole('button', { name: 'Create Account' }).click()

  await page.waitForURL('/login', { timeout: 15000 })

  // Login
  await page.fill('#username', username)
  await page.fill('#password', TEST_PASSWORD)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('/dashboard')
}

/**
 * Create a secure message on /send and return the read URL.
 */
async function createSecureMessage(
  page: Page,
  {
    message,
    password,
    autoDestruct,
    startDate,
  }: { message: string; password?: string; autoDestruct?: boolean; startDate?: string },
): Promise<string> {
  await page.goto('/send')
  await expect(page.locator('h1')).toHaveText('Send Encrypted Message')

  // Type message in MdEditor textarea
  await page.locator('.w-md-editor-text-input').fill(message)

  if (password) {
    await page.fill('#password', password)
  }

  if (autoDestruct) {
    await page.getByLabel('Auto-destruct').click()
  }

  if (startDate) {
    await page.fill('#startDate', startDate)
  }

  await page.getByRole('button', { name: 'Create Encrypted Message' }).click()

  // Wait for result card
  await page.waitForSelector('text=Message Created', { timeout: 15000 })

  const readUrl = await page.locator('code').innerText()
  expect(readUrl).toContain('/read/')
  return readUrl
}

/** Open a read URL in a fresh context and return the page. */
async function openReadUrl(
  context: BrowserContext,
  readUrl: string,
): Promise<Page> {
  const page = await context.newPage()
  await page.goto(readUrl)
  return page
}

// ── Test 1: Full send + read flow (no password) ──────────────────────────

test('send encrypted message and read it (no password)', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `sec_e2e_${crypto.randomUUID().slice(0, 8)}`
  await signupAndLogin(page, username)

  const plaintext = 'Hello **world**! This is a secure message.'
  const readUrl = await createSecureMessage(page, { message: plaintext })

  // Open read URL in a fresh incognito context
  const readCtx = await browser.newContext()
  const readPage = await readCtx.newPage()

  // Track whether a reveal POST is made before clicking View
  const revealCalls: string[] = []
  readPage.on('request', (req) => {
    if (req.url().includes('/reveal') && req.method() === 'POST') {
      revealCalls.push(req.url())
    }
  })

  await readPage.goto(readUrl)
  await readPage.waitForSelector('text=Encrypted Message', { timeout: 10000 })

  // Interstitial: View Message button visible, no reveal yet
  await expect(readPage.getByRole('button', { name: 'View Message' })).toBeVisible()
  expect(revealCalls).toHaveLength(0)

  // Click to reveal
  await readPage.getByRole('button', { name: 'View Message' }).click()

  // Verify decrypted content appears (bold "world" rendered from Markdown)
  await expect(readPage.getByText('Hello')).toBeVisible({ timeout: 15000 })
  await expect(readPage.getByText('This is a secure message.')).toBeVisible()

  await readCtx.close()
  await context.close()
})

// ── Test 2: Password-protected message ───────────────────────────────────

test('password-protected message', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `sec_e2e_${crypto.randomUUID().slice(0, 8)}`
  await signupAndLogin(page, username)

  const messagePassword = 's3cr3t!'
  const readUrl = await createSecureMessage(page, {
    message: 'Top secret **password-protected** content.',
    password: messagePassword,
  })

  const readCtx = await browser.newContext()
  const readPage = await readCtx.newPage()
  await readPage.goto(readUrl)
  await readPage.waitForSelector('text=Encrypted Message', { timeout: 10000 })

  // Password field should be visible
  await expect(readPage.locator('#read-password')).toBeVisible()
  await expect(readPage.getByRole('button', { name: 'View Message' })).toBeDisabled()

  // Enter WRONG password
  await readPage.fill('#read-password', 'wrong-password')
  await readPage.getByRole('button', { name: 'View Message' }).click()

  // Verify error shown
  await expect(
    readPage.getByText('Wrong password — could not decrypt the message key.'),
  ).toBeVisible({ timeout: 20000 })

  // Enter CORRECT password
  await readPage.fill('#read-password', messagePassword)
  await readPage.getByRole('button', { name: 'View Message' }).click()

  // Verify message displayed
  await expect(readPage.getByText('Top secret')).toBeVisible({ timeout: 20000 })
  await expect(readPage.getByText('password-protected')).toBeVisible()

  await readCtx.close()
  await context.close()
})

// ── Test 3: Auto-destruct ────────────────────────────────────────────────

test('auto-destruct message is destroyed after first read', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `sec_e2e_${crypto.randomUUID().slice(0, 8)}`
  await signupAndLogin(page, username)

  const readUrl = await createSecureMessage(page, {
    message: 'This will **self-destruct** after reading.',
    autoDestruct: true,
  })

  // First read — should succeed
  const readCtx = await browser.newContext()
  const readPage = await readCtx.newPage()
  await readPage.goto(readUrl)
  await readPage.waitForSelector('text=Encrypted Message', { timeout: 10000 })

  await readPage.getByRole('button', { name: 'View Message' }).click()
  await expect(readPage.getByText('This will')).toBeVisible({ timeout: 15000 })
  await expect(readPage.getByText('self-destruct')).toBeVisible()

  // Verify auto-destruct note is shown after reading
  await expect(
    readPage.getByText('This message has been destroyed after reading.'),
  ).toBeVisible()

  await readCtx.close()

  // Second read attempt — should show "Not Found"
  const secondReadCtx = await browser.newContext()
  const secondPage = await secondReadCtx.newPage()
  await secondPage.goto(readUrl)
  await secondPage.waitForSelector('text=Not Found', { timeout: 10000 })

  await expect(
    secondPage.getByText('This message no longer exists or has been destroyed.'),
  ).toBeVisible()

  await secondReadCtx.close()
  await context.close()
})

// ── Test 4: Date restriction (future start date) ─────────────────────────

test('message with future start date is not readable yet', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `sec_e2e_${crypto.randomUUID().slice(0, 8)}`
  await signupAndLogin(page, username)

  // Set start date 7 days in the future
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const futureStr = future.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm"

  const readUrl = await createSecureMessage(page, {
    message: 'This message has a future start date.',
    startDate: futureStr,
  })

  // Try to read — should show "Unavailable"
  const readCtx = await browser.newContext()
  const readPage = await readCtx.newPage()
  await readPage.goto(readUrl)
  await readPage.waitForSelector('text=Unavailable', { timeout: 10000 })

  await expect(
    readPage.getByText('This message is not available yet.'),
  ).toBeVisible()

  // View Message button should not be present
  await expect(
    readPage.getByRole('button', { name: 'View Message' }),
  ).not.toBeVisible()

  await readCtx.close()
  await context.close()
})
