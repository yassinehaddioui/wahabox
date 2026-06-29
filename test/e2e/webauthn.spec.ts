import { test, expect, type Page } from '@playwright/test'
import { clearRateLimits } from './helpers'

test.beforeEach(() => clearRateLimits())

/**
 * Set up a CDP virtual authenticator that simulates a platform passkey
 * provider (e.g. Touch ID, Windows Hello, or a hardware security key).
 *
 * Once enabled, Playwright intercepts the browser's native
 * `navigator.credentials.create()` and `navigator.credentials.get()` calls
 * and responds with CDP-synthesized WebAuthn responses.  This lets us test
 * the full registration → authentication round-trip without real hardware.
 *
 * The authenticator is configured as:
 *  - CTAP2 (FIDO2)
 *  - internal transport (platform authenticator)
 *  - resident key + user verification enabled
 *  - user already verified (no PIN / biometric prompt)
 *
 * Returns the CDP session and the authenticator ID so callers can
 * tweak the authenticator later (e.g. toggle user verification).
 */
async function setupVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  })
  return { cdp, authenticatorId }
}

/**
 * Helper: sign up a fresh user, complete the recovery-code challenge,
 * log in, and return the { username, password } tuple.
 */
async function createAndLoginUser(
  page: Page,
): Promise<{ username: string; password: string }> {
  const username = `webauthn_e2e_${crypto.randomUUID().slice(0, 8)}`
  const password = 'TestPassword123!'

  // Sign up
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

  // Log in
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('/dashboard')
  await expect(page.locator('h1')).toHaveText('Boxes')

  return { username, password }
}

// ─── passkey registration ────────────────────────────────────────────

test('register a passkey from the settings page', async ({ page }) => {
  // 1. Create user and log in
  await createAndLoginUser(page)

  // 2. Set up the virtual authenticator BEFORE we trigger any WebAuthn call
  await setupVirtualAuthenticator(page)

  // 3. Navigate to settings and scroll to the Passkeys section
  await page.goto('/settings')
  await page.waitForSelector('text=Passkeys')

  // 4. Optionally fill a device name so we can verify it later
  const deviceName = `E2E Key ${crypto.randomUUID().slice(0, 4)}`
  await page.fill('input[placeholder="Device name (optional)"]', deviceName)

  // 5. Click "Add Passkey" — this triggers setup → WebAuthn create → confirm
  await page.getByRole('button', { name: 'Add Passkey' }).click()

  // 6. Wait for the success toast
  await expect(page.locator('text=Passkey registered')).toBeVisible({ timeout: 15000 })

  // 7. The passkey should now appear in the list with the device name
  await expect(page.locator('p', { hasText: deviceName })).toBeVisible()

  // 8. The "Passkeys" header should update to reflect the count
  await expect(page.locator('text=1 passkey registered.')).toBeVisible()
})

// ─── passkey authentication during login ─────────────────────────────

test('authenticate with a passkey during login (MFA step)', async ({ page }) => {
  // 1. Create user, log in, register a passkey
  const { username, password } = await createAndLoginUser(page)

  await page.goto('/settings')
  await page.waitForSelector('text=Passkeys')
  await setupVirtualAuthenticator(page)

  await page.getByRole('button', { name: 'Add Passkey' }).click()
  await expect(page.locator('text=Passkey registered')).toBeVisible({ timeout: 15000 })

  // 2. Log out
  await page.getByRole('button', { name: 'Logout' }).click()
  await page.waitForURL('/login')

  // 3. Log back in — the server should now require MFA (passkey is enabled)
  await page.fill('#username', username)
  await page.fill('#password', password)
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()

  // 4. MFA screen should appear with the passkey option
  await page.waitForSelector('text=Verify Your Identity', { timeout: 10000 })
  await expect(page.locator('text=Passkey')).toBeVisible()

  // 5. Click "Verify with Passkey" — this triggers WebAuthn get → assertion → completion
  await page.getByRole('button', { name: 'Verify with Passkey' }).click()

  // 6. Should land on the dashboard (MFA completed)
  await page.waitForURL('/dashboard', { timeout: 15000 })
  await expect(page.locator('h1')).toHaveText('Boxes')
})

// ─── passkey list and delete ─────────────────────────────────────────

test('list and delete a passkey from settings', async ({ page }) => {
  // 1. Create user, log in, register two passkeys to exercise the list fully
  await createAndLoginUser(page)

  await page.goto('/settings')
  await page.waitForSelector('text=Passkeys')
  await setupVirtualAuthenticator(page)

  // Register first passkey
  await page.fill('input[placeholder="Device name (optional)"]', 'My MacBook')
  await page.getByRole('button', { name: 'Add Passkey' }).click()
  await expect(page.locator('text=Passkey registered')).toBeVisible({ timeout: 15000 })

  // Register second passkey
  await page.fill('input[placeholder="Device name (optional)"]', 'My YubiKey')
  await page.getByRole('button', { name: 'Add Passkey' }).click()
  await expect(page.locator('text=Passkey registered')).toBeVisible({ timeout: 15000 })

  // 2. Both passkeys should appear in the list
  await expect(page.locator('text=My MacBook')).toBeVisible()
  await expect(page.locator('text=My YubiKey')).toBeVisible()
  await expect(page.locator('text=2 passkeys registered.')).toBeVisible()

  // 3. Delete the first passkey (click the trash icon next to "My MacBook")
  //    The trash button is an icon-sm button in the same container as the device name
  const firstPasskeyRow = page.locator('div', { has: page.locator('text=My MacBook') }).filter({
    has: page.locator('button'),
  }).last()
  await firstPasskeyRow.locator('button').click()

  // 4. Wait for the deletion toast and verify the passkey is gone
  await expect(page.locator('text=Passkey removed')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('text=My MacBook')).not.toBeVisible()

  // 5. The remaining passkey should still be present
  await expect(page.locator('text=My YubiKey')).toBeVisible()
  await expect(page.locator('text=1 passkey registered.')).toBeVisible()

  // 6. Delete the second passkey — passkey MFA should auto-disable
  const secondRow = page.locator('div', { has: page.locator('text=My YubiKey') }).filter({
    has: page.locator('button'),
  }).last()
  await secondRow.locator('button').click()

  await expect(page.locator('text=Passkey removed')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('text=My YubiKey')).not.toBeVisible()

  // After all passkeys are deleted, the description reverts to the default
  await expect(page.locator('text=Use biometrics or a security key to verify your identity.')).toBeVisible()
})
