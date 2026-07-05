import { test, expect } from '@playwright/test'
import { clearRateLimits, signupAndLogin } from './helpers'

test.beforeEach(() => clearRateLimits())

test('full vault CRUD cycle: create, rename, open, create item, decrypt, edit, delete item, delete vault', async ({
  page,
}) => {
  // Step 1: Sign up and login
  await signupAndLogin(page, 'vault')

  // Step 2: Navigate to vaults
  await page.goto('/vaults')
  await expect(page.locator('h1')).toHaveText('Vaults')
  await expect(page.getByText('No vaults yet')).toBeVisible()

  // Step 3: Create a vault with label "Test Vault"
  await page.fill('input[placeholder="Vault name"]', 'Test Vault')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('link', { name: 'Test Vault' })).toBeVisible({ timeout: 5000 })
  // Assert item count badge shows 0
  await expect(page.getByText('0', { exact: true }).first()).toBeVisible()

  // Step 4: Rename vault to "Renamed Vault"
  await page.getByRole('button', { name: 'Edit vault' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.locator('#edit-label').fill('Renamed Vault')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Renamed Vault' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Test Vault' })).not.toBeVisible()

  // Step 5: Click vault card → detail page
  await page.getByRole('link', { name: 'Renamed Vault' }).click()
  await page.waitForURL(/\/\/vaults\//)
  await expect(page.locator('h1')).toHaveText('Renamed Vault')
  await expect(page.getByText('0 items')).toBeVisible()

  // Step 6: Create vault item with encrypted title/body
  await page.fill('input[placeholder="Item title"]', 'Encrypted Note')
  await page.locator('textarea[placeholder="Markdown body..."]').fill('Secret content here')
  await page.getByRole('button', { name: 'Create' }).click()
  // Wait for client-side encryption + POST to complete, item card shows default title
  await expect(page.getByText('Encrypted item')).toBeVisible({ timeout: 10000 })

  // Step 7: Show (decrypt) item — assert plaintext appears
  await page.getByRole('button', { name: 'Decrypt item' }).click()
  await expect(page.getByText('Encrypted Note')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Secret content here')).toBeVisible()

  // Step 8: Hide item — assert plaintext disappears, title reverts
  await page.getByRole('button', { name: 'Hide item' }).click()
  await expect(page.getByText('Encrypted item')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('Secret content here')).not.toBeVisible()

  // Step 9: Decrypt again, edit title and body, save — assert updates
  await page.getByRole('button', { name: 'Decrypt item' }).click()
  await expect(page.getByText('Encrypted Note')).toBeVisible({ timeout: 10000 })
  await page.getByRole('button', { name: 'Edit item' }).click()
  await page.locator('#edit-title').fill('Updated Note')
  await page.locator('#edit-body').fill('New content')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Updated Note')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('New content')).toBeVisible()

  // Step 10a: Delete item — confirm in dialog
  await page.getByRole('button', { name: 'Delete item' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('No items yet')).toBeVisible({ timeout: 5000 })

  // Step 10b: Navigate back, delete vault — confirm, assert vault gone
  await page.goto('/vaults')
  await page.getByRole('button', { name: 'Delete vault' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.locator('#delete-confirm').fill('DELETE')
  await page.getByRole('button', { name: 'Delete forever' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Renamed Vault' })).not.toBeVisible()
  await expect(page.getByText('No vaults yet')).toBeVisible()
})

test('should protect vault with password', async ({ page }) => {
  test.slow() // signup crypto is slow in Docker dev
  // Step 1: Sign up and login
  await signupAndLogin(page, 'vaultpass')

  // Step 2: Navigate to vaults
  await page.goto('/vaults')
  await expect(page.locator('h1')).toHaveText('Vaults')

  // Step 3: Create vault with password
  await page.fill('input[placeholder="Vault name"]', 'Password Vault')
  await page.fill('input[placeholder="Optional: set a vault password"]', 'Secret123')
  await page.getByRole('button', { name: 'Create' }).click()

  // Wait for empty state to disappear (vault was created)
  await expect(page.getByText('No vaults yet')).not.toBeVisible({ timeout: 10000 })

  // Verify vault appears in list with Lock icon
  const vaultLink = page.getByRole('link', { name: 'Password Vault' })
  await expect(vaultLink).toBeVisible()
  // Lock icon is an amber SVG inside the vault link
  await expect(vaultLink.locator('svg.text-amber-500')).toBeVisible()

  // Step 4: Navigate into vault — password prompt appears
  await vaultLink.click()
  await page.waitForURL(/\/\/vaults\//)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Vault password required')).toBeVisible()

  // Step 5: Enter password and unlock
  await page.fill('#vault-password', 'Secret123')
  await page.getByRole('button', { name: 'Unlock' }).click()

  // Verify dialog dismissed, empty state shown
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText('No items yet')).toBeVisible()

  // Verify sessionStorage caches the password
  const vaultId = page.url().split('/').pop()!
  const cachedAfterUnlock = await page.evaluate(
    (id) => sessionStorage.getItem(`vault:${id}:password`),
    vaultId,
  )
  expect(cachedAfterUnlock).toBe('Secret123')

  // Step 6: Create an item inside the vault
  await page.fill('input[placeholder="Item title"]', 'Secure Note')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByText('Secure Note')).toBeVisible({ timeout: 10000 })

  // Step 7: Lock Vault — clears sessionStorage and re-shows password prompt
  await page.locator('button[title="Lock vault"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Vault password required')).toBeVisible()

  // Verify sessionStorage was cleared on lock
  const cachedAfterLock = await page.evaluate(
    (id) => sessionStorage.getItem(`vault:${id}:password`),
    vaultId,
  )
  expect(cachedAfterLock).toBeNull()

  // Step 8: Unlock again, then refresh — should NOT prompt (sessionStorage persists)
  await page.fill('#vault-password', 'Secret123')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText('Secure Note')).toBeVisible({ timeout: 5000 })

  // Refresh the page — password is cached, items should load without prompt
  await page.reload()
  await page.waitForURL(/\/\/vaults\//)
  await expect(page.getByText('Secure Note')).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('dialog')).not.toBeVisible()

  // Step 9: Navigate back to vaults and change the vault password
  await page.goto('/vaults')
  await expect(page.locator('h1')).toHaveText('Vaults')

  // Wait for the password-protected vault card to appear
  await expect(page.getByRole('link', { name: 'Password Vault' })).toBeVisible({ timeout: 10_000 })

  // Open edit dialog for the password-protected vault
  await page.getByRole('button', { name: 'Edit vault' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Fill current password + new password
  await page.fill('#edit-current-password', 'Secret123')
  await page.fill('#edit-password', 'NewSecret456')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()

  // Step 10: Navigate into vault — old cached password fails (401), prompts for new one
  await page.getByRole('link', { name: 'Password Vault' }).click()
  await page.waitForURL(/\/\/vaults\//)
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('Vault password required')).toBeVisible()

  // Enter the new password and unlock
  await page.fill('#vault-password', 'NewSecret456')
  await page.getByRole('button', { name: 'Unlock' }).click()

  // Items should load with the new password
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByText('Secure Note')).toBeVisible({ timeout: 5000 })
})
