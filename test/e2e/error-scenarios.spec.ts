import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { clearRateLimits, addTurnstileProofCookie } from './helpers'

test.beforeEach(() => clearRateLimits())

const TEST_PASSWORD = 'TestPassword123!'

// ── Helpers ────────────────────────────────────────────────────────────────

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
 * Complete a full signup flow and return after the account is created
 * (redirected to /login). Does NOT log in.
 */
async function signupOnly(page: Page, username: string) {
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
}

/** Create a PO box via the dashboard form and return its id and slug. */
async function createBoxViaDashboard(page: Page, label: string): Promise<{ id: string; slug: string }> {
  await page.fill('input[placeholder="Box name"]', label)
  await page.getByRole('button', { name: 'Create' }).click()

  // Wait for the box to appear — the link to the box details
  const boxLink = page.getByRole('link', { name: label })
  await expect(boxLink).toBeVisible({ timeout: 10000 })

  // Extract box id from the dashboard link: /dashboard/boxes/{id}
  const detailsHref = await boxLink.getAttribute('href')
  const id = detailsHref!.split('/dashboard/boxes/')[1]

  // Extract slug from the drop link
  const dropLink = page.locator('a[href*="/drop/"]').first()
  const dropHref = await dropLink.getAttribute('href')
  const slug = dropHref!.split('/drop/')[1]

  return { id, slug }
}

/** PATCH a box via the API (requires authenticated page context). */
async function patchBox(
  page: Page,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const result = await page.evaluate(async ({ id, data }) => {
    const csrfRes = await fetch('/api/csrf?tag=edit-box')
    const csrfData = await csrfRes.json()
    if (!csrfData.success) return { success: false, error: 'CSRF fetch failed' }

    const res = await fetch(`/api/boxes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, csrfToken: csrfData.data.csrfToken }),
    })
    return res.json()
  }, { id, data })

  if (!result.success) {
    throw new Error(`patchBox failed for ${id}: ${result.error}`)
  }
}

/** Set a password on an existing box via the dashboard edit dialog. */
async function setBoxPassword(page: Page, password: string) {
  // Open the edit dialog for the box (only one box exists on the dashboard)
  await page.getByRole('button', { name: 'Edit box' }).click()

  // Wait for dialog to appear
  await expect(page.getByRole('heading', { name: 'Edit Box' })).toBeVisible({ timeout: 5000 })

  // Fill password and save
  await page.fill('#edit-password', password)
  await page.getByRole('button', { name: 'Save' }).click()

  // Wait for dialog to close
  await expect(page.getByRole('heading', { name: 'Edit Box' })).not.toBeVisible({ timeout: 5000 })
}

/** Navigate to a drop URL and wait for the error card to appear. */
async function expectDropNotFound(page: Page, slug: string) {
  await page.goto(`/drop/${slug}`)
  await expect(page.getByText('Not Found')).toBeVisible({ timeout: 10000 })
  await expect(
    page.getByText('This drop link is invalid or inactive.'),
  ).toBeVisible()
}

// ── Test 1: Expired box shows appropriate error ────────────────────────────

test('expired box shows appropriate error', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `err_e2e_${crypto.randomUUID().slice(0, 8)}`
  await signupAndLogin(page, username)

  const { id, slug } = await createBoxViaDashboard(page, 'ExpiredBox')

  // Set expiresAt to 1 day in the past
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await patchBox(page, id, { expiresAt: pastDate })

  // Open drop page in a fresh (anonymous) context
  const dropCtx = await browser.newContext()
  await addTurnstileProofCookie(dropCtx)
  const dropPage = await dropCtx.newPage()
  await expectDropNotFound(dropPage, slug)

  // Verify the error is user-friendly (not a stack trace or technical error)
  const errorText = await dropPage.locator('.text-muted-foreground').first().innerText()
  expect(errorText).not.toContain('Error')
  expect(errorText).not.toContain('undefined')
  expect(errorText).not.toContain('Internal server error')

  await dropCtx.close()
  await context.close()
})

// ── Test 2: Inactive box shows appropriate error ───────────────────────────

test('inactive box shows appropriate error', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `err_e2e_${crypto.randomUUID().slice(0, 8)}`
  await signupAndLogin(page, username)

  const { slug } = await createBoxViaDashboard(page, 'InactiveBox')

  // Toggle the Active switch to deactivate the box
  const switchEl = page.getByRole('switch')
  await switchEl.click()
  // Wait for the toast confirming deactivation
  await expect(page.getByText('Box deactivated')).toBeVisible({ timeout: 5000 })

  // Open drop page in a fresh context
  const dropCtx = await browser.newContext()
  await addTurnstileProofCookie(dropCtx)
  const dropPage = await dropCtx.newPage()
  await expectDropNotFound(dropPage, slug)

  const errorText = await dropPage.locator('.text-muted-foreground').first().innerText()
  expect(errorText).not.toContain('Internal server error')

  await dropCtx.close()
  await context.close()
})

// ── Test 3: Full box (maxMessages reached) shows appropriate error ─────────

test('full box shows appropriate error when maxMessages is reached', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `err_e2e_${crypto.randomUUID().slice(0, 8)}`
  await signupAndLogin(page, username)

  const { id, slug } = await createBoxViaDashboard(page, 'FullBox')

  // Set maxMessages to 1 so the box becomes full after one message
  await patchBox(page, id, { maxMessages: 1 })

  // Visit the drop page in a fresh context and submit a message
  const dropCtx = await browser.newContext()
  await addTurnstileProofCookie(dropCtx)
  const dropPage = await dropCtx.newPage()
  await dropPage.goto(`/drop/${slug}`)
  await dropPage.waitForSelector('text=Send an encrypted message')

  // Fill the message textarea and submit
  await dropPage.locator('textarea').fill('Filling up the box')
  await dropPage.getByRole('button', { name: 'Send Message' }).click()

  // Wait for success confirmation
  await expect(dropPage.getByText('Message Sent!')).toBeVisible({ timeout: 15000 })

  // Reload the page — the box is now full and should show the error
  await dropPage.reload()
  await expect(dropPage.getByText('Not Found')).toBeVisible({ timeout: 10000 })
  await expect(
    dropPage.getByText('This drop link is invalid or inactive.'),
  ).toBeVisible()

  const errorText = await dropPage.locator('.text-muted-foreground').first().innerText()
  expect(errorText).not.toContain('Internal server error')

  await dropCtx.close()
  await context.close()
})

// ── Test 4: Wrong password on password-protected box ───────────────────────

test('wrong password on password-protected box shows error', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `err_e2e_${crypto.randomUUID().slice(0, 8)}`
  await signupAndLogin(page, username)

  const { slug } = await createBoxViaDashboard(page, 'PasswordBox')

  // Set a password on the box via the edit dialog
  await setBoxPassword(page, 'correct-password')

  // Visit the drop page in a fresh context
  const dropCtx = await browser.newContext()
  await addTurnstileProofCookie(dropCtx)
  const dropPage = await dropCtx.newPage()
  await dropPage.goto(`/drop/${slug}`)

  // Wait for the form to load with password field visible
  await expect(
    dropPage.getByPlaceholder('Enter password to send a message'),
  ).toBeVisible({ timeout: 10000 })

  // Fill message and wrong password, then submit
  await dropPage.locator('.w-md-editor-text-input').fill('Secret message')
  await dropPage.getByPlaceholder('Enter password to send a message').fill('wrong-password')
  await dropPage.getByRole('button', { name: 'Send Message' }).click()

  // Verify the password error appears (red text below the password input)
  await expect(dropPage.getByText('Invalid password')).toBeVisible({ timeout: 15000 })

  // The error should NOT be a generic/technical error
  const passwordError = await dropPage.locator('.text-destructive').first().innerText()
  expect(passwordError).not.toContain('Internal server error')
  expect(passwordError).not.toContain('TypeError')
  expect(passwordError).not.toContain('undefined')

  await dropCtx.close()
  await context.close()
})

// ── Test 5: Invalid slug shows 404 ─────────────────────────────────────────

test('invalid slug shows 404 error', async ({ page }) => {
  const invalidSlug = `nonexistent-${crypto.randomUUID().slice(0, 8)}`
  await page.goto(`/drop/${invalidSlug}`)

  // Should show "Not Found" card
  await expect(page.getByText('Not Found')).toBeVisible({ timeout: 10000 })
  await expect(
    page.getByText('This drop link is invalid or inactive.'),
  ).toBeVisible()

  // Verify the error is user-friendly
  const errorText = await page.locator('.text-muted-foreground').first().innerText()
  expect(errorText).not.toContain('Internal server error')
  expect(errorText).not.toContain('stack')
})

// ── Test 6: Duplicate username signup shows error ──────────────────────────

test('duplicate username signup shows error', async ({ page }) => {
  const username = `err_e2e_${crypto.randomUUID().slice(0, 8)}`

  // First signup — should succeed
  await signupOnly(page, username)

  // Second signup with the same username — should fail
  await page.goto('/signup')
  await page.fill('#username', username)
  await page.fill('#password', TEST_PASSWORD)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.waitForSelector('text=Save Your Recovery Code')

  const recoveryCode = await page.locator('code').innerText()
  await page.getByRole('button', { name: "I've saved my recovery code" }).click()
  await page.fill('input[placeholder="Enter your recovery code"]', recoveryCode)
  await page.getByRole('button', { name: 'Create Account' }).click()

  // Wait for the duplicate error to appear
  await expect(
    page.getByText('This username is already taken'),
  ).toBeVisible({ timeout: 15000 })

  // Verify error is user-friendly
  const errorText = await page.locator('.text-destructive').first().innerText()
  expect(errorText).not.toContain('Internal server error')
  expect(errorText).not.toContain('P2002')
})

// ── Test 7: Wrong credentials login shows error ────────────────────────────

test('wrong credentials login shows error', async ({ page }) => {
  const username = `err_e2e_${crypto.randomUUID().slice(0, 8)}`

  // Sign up a user first
  await signupOnly(page, username)

  // Now try to log in with wrong password
  await page.fill('#username', username)
  await page.fill('#password', 'WrongPassword456!')
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()

  // Wait for the error to appear
  await expect(page.getByText('Invalid credentials')).toBeVisible({ timeout: 15000 })

  // Verify error is user-friendly — should not leak internal details
  const errorText = await page.locator('.text-destructive').first().innerText()
  expect(errorText).not.toContain('Internal server error')
  expect(errorText).not.toContain('authVerifier')
  expect(errorText).not.toContain('constantTimeEqual')
})

// ── Test 8: Expired session redirects to login ─────────────────────────────

test('expired session redirects to login', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  const username = `err_e2e_${crypto.randomUUID().slice(0, 8)}`
  await signupAndLogin(page, username)

  // Verify we are on the dashboard
  await expect(page.locator('h1')).toHaveText('Boxes')

  // Delete the session cookie to simulate expiration
  await context.clearCookies()

  // Navigate to dashboard — should redirect to login
  // Use domcontentloaded to avoid redirect race conditions
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#username')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('#password')).toBeVisible()

  // Verify we are on the login page
  await expect(page.locator('[data-slot="card-title"]')).toHaveText('Sign In')
  await expect(page.locator('#username')).toBeVisible()

  await context.close()
})
