import { test, expect } from '@playwright/test'
import { clearRateLimits, signupAndLogin } from './helpers'

test.beforeEach(() => clearRateLimits())

test('full vault CRUD cycle: create, rename, open, create item, decrypt, edit, delete item, delete vault', async ({
  page,
}) => {
  // Step 1: Sign up and login
  await signupAndLogin(page, 'vault')

  // Step 2: Navigate to vaults
  await page.goto('/dashboard/vaults')
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
  await page.waitForURL(/\/dashboard\/vaults\//)
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
  await page.goto('/dashboard/vaults')
  await page.getByRole('button', { name: 'Delete vault' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.locator('#delete-confirm').fill('DELETE')
  await page.getByRole('button', { name: 'Delete forever' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Renamed Vault' })).not.toBeVisible()
  await expect(page.getByText('No vaults yet')).toBeVisible()
})
