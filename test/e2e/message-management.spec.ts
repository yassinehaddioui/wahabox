import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { clearRateLimits, addTurnstileProofCookie } from './helpers'

test.beforeEach(() => clearRateLimits())

const TEST_PASSWORD = 'TestPassword123!'

/** Sign up a new user, verify recovery code, log in, create a box, and return its slug. */
async function signupAndCreateBox(page: Page, username: string, boxName = 'Test Box'): Promise<string> {
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

  // Create box
  await page.fill('input[placeholder="Box name"]', boxName)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForSelector('a[href^="/drop/"]')

  // Extract slug from drop link
  const dropLink = await page.locator('a[href^="/drop/"]').first().textContent()
  return dropLink!.trim().replace('/drop/', '')
}

/**
 * Submit an encrypted message via the drop page in a fresh incognito context.
 * Returns after the "Message Sent!" confirmation is visible.
 */
async function submitDropMessage(
  browser: BrowserContext,
  slug: string,
  message: string,
): Promise<void> {
  await addTurnstileProofCookie(browser)
  const dropPage = await browser.newPage()
  await dropPage.goto(`/drop/${slug}`)
  await dropPage.waitForSelector('text=Send an encrypted message')
  await dropPage.locator('textarea').fill(message)
  await dropPage.getByRole('button', { name: 'Send Message' }).click()
  await dropPage.waitForSelector('text=Message Sent!')
  await dropPage.close()
}

/**
 * Navigate from the dashboard to a box's messages page by clicking its link.
 */
async function openBoxMessages(page: Page, boxLabel: string): Promise<void> {
  await page.getByRole('link', { name: boxLabel }).click()
  await page.waitForURL(/\/dashboard\/boxes\//)
  await page.waitForSelector('text=message')
}

// ── Test 1: View multiple messages in a box ────────────────────────────────

test('view multiple messages in a box', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `mgmt_e2e_${crypto.randomUUID().slice(0, 8)}`
  const slug = await signupAndCreateBox(page, username)

  // Submit 3 messages via drop page (incognito)
  const incognito = await browser.newContext()
  await submitDropMessage(incognito, slug, 'First message')
  await submitDropMessage(incognito, slug, 'Second message')
  await submitDropMessage(incognito, slug, 'Third message')
  await incognito.close()

  // Reload dashboard and open the box
  await page.reload()
  await page.waitForSelector('a[href^="/drop/"]')
  await openBoxMessages(page, 'Test Box')

  // Verify message count
  await expect(page.locator('text=3 messages')).toBeVisible()

  // Verify 3 message cards are rendered (each card has a Delete button)
  const deleteButtons = page.getByRole('button', { name: 'Delete message' })
  await expect(deleteButtons).toHaveCount(3)

  await context.close()
})

// ── Test 2: Mark message as read ──────────────────────────────────────────

test('mark message as read and verify badge update', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `mgmt_e2e_${crypto.randomUUID().slice(0, 8)}`
  const slug = await signupAndCreateBox(page, username)

  // Submit 1 message
  const incognito = await browser.newContext()
  await submitDropMessage(incognito, slug, 'Unread message content')
  await incognito.close()

  // Reload and open the box
  await page.reload()
  await page.waitForSelector('a[href^="/drop/"]')
  await openBoxMessages(page, 'Test Box')

  // Verify unread state: count shows "(1 new)"
  await expect(page.locator('text=1 message').locator('..')).toContainText('1 new')

  // Verify amber ring on unread card
  await expect(page.locator('.ring-2.ring-amber-400')).toBeVisible()

  // Verify NEW badge exists
  await expect(page.locator('.ring-amber-400').getByText('NEW')).toBeVisible()

  // Decrypt the message (marks as read via PATCH)
  await page.getByRole('button', { name: 'Decrypt message' }).click()
  await expect(page.getByText('NEW', { exact: true })).not.toBeVisible()

  // After decryption, NEW badge should be gone
  await expect(page.getByText('NEW', { exact: true })).not.toBeVisible()

  // Amber ring should be gone
  await expect(page.locator('.ring-2.ring-amber-400')).not.toBeVisible()

  // Should show read timestamp
  await expect(page.locator('text=Read')).toBeVisible()

  // Verify no "(N new)" text in subtitle
  const subtitle = page.locator('p:has-text("message")')
  await expect(subtitle).not.toContainText('new')

  await context.close()
})

// ── Test 3: Delete a message ──────────────────────────────────────────────

test('delete a message via confirmation dialog', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `mgmt_e2e_${crypto.randomUUID().slice(0, 8)}`
  const slug = await signupAndCreateBox(page, username)

  // Submit 2 messages so we can verify only one gets deleted
  const incognito = await browser.newContext()
  await submitDropMessage(incognito, slug, 'Message to keep')
  await submitDropMessage(incognito, slug, 'Message to delete')
  await incognito.close()

  // Reload and open the box
  await page.reload()
  await page.waitForSelector('a[href^="/drop/"]')
  await openBoxMessages(page, 'Test Box')

  // Verify 2 messages present
  await expect(page.locator('text=2 messages')).toBeVisible()

  // Click delete (trash) button on the first message card
  await page.getByRole('button', { name: 'Delete message' }).first().click()

  // Verify confirmation dialog appears
  await expect(page.getByRole('heading', { name: 'Delete message' })).toBeVisible()
  await expect(
    page.getByText('Are you sure you want to delete this message?'),
  ).toBeVisible()

  // Click Cancel - verify dialog closes without deleting
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Delete message' })).not.toBeVisible()
  await expect(page.locator('text=2 messages')).toBeVisible()

  // Click delete again, then confirm
  await page.getByRole('button', { name: 'Delete message' }).first().click()
  await page.getByRole('button', { name: 'Delete' }).click()

  // Wait for deletion to complete
  await expect(page.locator('text=1 message')).toBeVisible()

  // Verify delete buttons reduced to 1
  await expect(page.getByRole('button', { name: 'Delete message' })).toHaveCount(1)

  await context.close()
})

// ── Test 4: Decrypt and view message content ──────────────────────────────

test('decrypt message and toggle content visibility', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `mgmt_e2e_${crypto.randomUUID().slice(0, 8)}`
  const slug = await signupAndCreateBox(page, username)

  const plaintext = 'Hello from the **encrypted** PO Box!'

  const incognito = await browser.newContext()
  await submitDropMessage(incognito, slug, plaintext)
  await incognito.close()

  // Reload and open the box
  await page.reload()
  await page.waitForSelector('a[href^="/drop/"]')
  await openBoxMessages(page, 'Test Box')

  // Message content should NOT be visible before decryption
  await expect(page.getByText('Hello from the')).not.toBeVisible()

  // Click decrypt
  await page.getByRole('button', { name: 'Decrypt message' }).click()
  await expect(page.getByText('Hello from the')).toBeVisible()
  await expect(page.getByText('encrypted').locator('strong')).toBeVisible()

  // After decryption, download button should be enabled
  await expect(page.getByRole('button', { name: 'Download as markdown' })).toBeEnabled()

  // Toggle hide (EyeOff button)
  await page.getByRole('button', { name: 'Hide message' }).click()

  // Content should be hidden again
  await expect(page.getByText('Hello from the')).not.toBeVisible()

  // Download button should be disabled again
  await expect(page.getByRole('button', { name: 'Download as markdown' })).toBeDisabled()

  await context.close()
})

// ── Test 5: Auto-decrypt toggle behavior ──────────────────────────────────

test('auto-decrypt toggle decrypts and hides messages', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `mgmt_e2e_${crypto.randomUUID().slice(0, 8)}`
  const slug = await signupAndCreateBox(page, username)

  // Submit 2 messages
  const incognito = await browser.newContext()
  await submitDropMessage(incognito, slug, 'Auto-decrypt message one')
  await submitDropMessage(incognito, slug, 'Auto-decrypt message two')
  await incognito.close()

  // Reload and open the box
  await page.reload()
  await page.waitForSelector('a[href^="/drop/"]')
  await openBoxMessages(page, 'Test Box')

  // Verify 2 messages present
  await expect(page.locator('text=2 messages')).toBeVisible()

  // Auto-decrypt should be OFF by default
  const autoDecryptBadge = page.locator('text=OFF').first()
  await expect(autoDecryptBadge).toBeVisible()

  // Message contents should be hidden
  await expect(page.getByText('Auto-decrypt message one')).not.toBeVisible()
  await expect(page.getByText('Auto-decrypt message two')).not.toBeVisible()

  // Toggle auto-decrypt ON
  await page.locator('#auto-decrypt').click()
  await expect(page.getByText('Auto-decrypt message one')).toBeVisible()

  // Badge should show ON
  await expect(page.locator('text=ON')).toBeVisible()

  // Both messages should now be decrypted and visible
  await expect(page.getByText('Auto-decrypt message one')).toBeVisible()
  await expect(page.getByText('Auto-decrypt message two')).toBeVisible()

  // Both download buttons should be enabled
  const downloadButtons = page.getByRole('button', { name: 'Download as markdown' })
  await expect(downloadButtons).toHaveCount(2)
  for (const btn of await downloadButtons.all()) {
    await expect(btn).toBeEnabled()
  }

  // Toggle auto-decrypt OFF
  await page.locator('#auto-decrypt').click()
  await expect(page.locator('text=OFF').first()).toBeVisible()
  await expect(page.locator('text=OFF').first()).toBeVisible()

  // Messages should be hidden again
  await expect(page.getByText('Auto-decrypt message one')).not.toBeVisible()
  await expect(page.getByText('Auto-decrypt message two')).not.toBeVisible()

  await context.close()
})
