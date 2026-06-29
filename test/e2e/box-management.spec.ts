import { test, expect, type Page } from '@playwright/test'
import { clearRateLimits } from './helpers'

test.beforeEach(() => clearRateLimits())

async function signUpAndLogin(page: Page, prefix: string) {
  const username = `${prefix}_${crypto.randomUUID().slice(0, 8)}`
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
  await expect(page.locator('h1')).toHaveText('Boxes')

  return { username, password }
}

async function createBox(page: Page, label: string) {
  await page.fill('input[placeholder="Box name"]', label)
  await page.getByRole('button', { name: 'Create' }).click()
  // Wait for the box card to appear in the list
  await expect(page.getByRole('link', { name: label })).toBeVisible({ timeout: 5000 })
}

test('create a new PO box', async ({ page }) => {
  await signUpAndLogin(page, 'create')

  // Verify empty state
  await expect(page.getByText('No PO boxes yet')).toBeVisible()

  // Create the box
  await createBox(page, 'E2E Create Test')

  // Verify the box appears with correct elements
  await expect(page.getByRole('link', { name: 'E2E Create Test' })).toBeVisible()
  // Drop link should be present
  const dropLink = page.locator('a[href^="/drop/"]').first()
  await expect(dropLink).toBeVisible()
  const href = await dropLink.getAttribute('href')
  expect(href).toMatch(/^\/drop\/[A-Za-z0-9_-]+$/)
  // Active switch should be present and checked by default
  const activeSwitch = page.getByRole('switch').first()
  await expect(activeSwitch).toBeVisible()
  await expect(activeSwitch).toBeChecked()
})

test('edit box label and greeting', async ({ page }) => {
  await signUpAndLogin(page, 'edit')
  await createBox(page, 'Original Label')

  // Open edit dialog
  await page.getByRole('button', { name: 'Edit box' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Verify current values are pre-filled
  const labelInput = page.locator('#edit-label')
  await expect(labelInput).toHaveValue('Original Label')
  const greetingTextarea = page.locator('#edit-greeting')
  await expect(greetingTextarea).toHaveValue('')

  // Change label and greeting
  await labelInput.fill('Updated Label')
  await greetingTextarea.fill('Welcome to my secret box!')

  // Save changes
  await page.getByRole('button', { name: 'Save' }).click()

  // Wait for dialog to close and page to refresh
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Updated Label' })).toBeVisible()
  // Old label should be gone
  await expect(page.getByRole('link', { name: 'Original Label' })).not.toBeVisible()
})

test('toggle box active/inactive status', async ({ page }) => {
  await signUpAndLogin(page, 'toggle')
  await createBox(page, 'Toggle Test Box')

  // Get the Active switch (first switch on the page, inside the box card)
  const activeSwitch = page.getByRole('switch').first()
  await expect(activeSwitch).toBeChecked()

  // Toggle off
  await activeSwitch.click()
  // Wait for state to update — the switch should now be unchecked
  await expect(activeSwitch).not.toBeChecked()

  // Toggle back on
  await activeSwitch.click()
  await expect(activeSwitch).toBeChecked()
})

test('rotate box slug', async ({ page }) => {
  await signUpAndLogin(page, 'rotate')
  await createBox(page, 'Rotate Test Box')

  // Capture the original slug from the drop link
  const dropLink = page.locator('a[href^="/drop/"]').first()
  const originalHref = await dropLink.getAttribute('href')
  const originalSlug = originalHref!.split('/').pop()!
  expect(originalSlug).toBeTruthy()

  // Open rotate dialog
  await page.getByRole('button', { name: 'Rotate drop link' }).click()
  const rotateDialog = page.getByRole('dialog')
  await expect(rotateDialog).toBeVisible()
  await expect(rotateDialog.getByText('Rotate Drop Link')).toBeVisible()

  // Confirm rotation
  await page.getByRole('button', { name: 'Rotate & Copy Link' }).click()

  // Wait for dialog to close and page to refresh
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.waitForSelector('a[href^="/drop/"]')

  // Capture the new slug — it should be different from the original
  const newDropLink = page.locator('a[href^="/drop/"]').first()
  const newHref = await newDropLink.getAttribute('href')
  const newSlug = newHref!.split('/').pop()!
  expect(newSlug).toBeTruthy()
  expect(newSlug).not.toBe(originalSlug)
})

test('set and remove box password', async ({ page }) => {
  await signUpAndLogin(page, 'pass')
  await createBox(page, 'Password Test Box')

  // Open edit dialog
  await page.getByRole('button', { name: 'Edit box' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Verify no password set initially — label should say "Set a password (optional)"
  await expect(page.getByText('Set a password (optional)')).toBeVisible()

  // Set a password
  const passwordInput = page.locator('#edit-password')
  await passwordInput.fill('SecretPass123')
  await page.getByRole('button', { name: 'Save' }).click()

  // Wait for dialog to close and page to refresh
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.waitForSelector('text=Password Test Box')

  // Re-open edit dialog to verify password is set
  await page.getByRole('button', { name: 'Edit box' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // "Change password" label indicates hasPassword is true
  await expect(page.getByText('Change password')).toBeVisible()
  // Remove button should be present
  await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible()

  // Remove the password
  await page.getByRole('button', { name: 'Remove' }).click()

  // Wait for refresh
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.waitForSelector('text=Password Test Box')

  // Re-open to verify password is gone
  await page.getByRole('button', { name: 'Edit box' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Set a password (optional)')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove' })).not.toBeVisible()
})

test('delete a box with confirmation', async ({ page }) => {
  await signUpAndLogin(page, 'delete')
  await createBox(page, 'Delete Test Box')

  // Verify box exists
  await expect(page.getByRole('link', { name: 'Delete Test Box' })).toBeVisible()

  // Open edit dialog
  await page.getByRole('button', { name: 'Edit box' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Click "Delete box" inside the edit dialog
  await page.getByRole('button', { name: 'Delete box' }).click()

  // Delete confirmation dialog should appear
  // The delete dialog has its own role="dialog" — we need to wait for it
  await expect(page.getByText('Delete box')).toHaveCount(2) // dialog title + button
  await expect(page.getByText('This will permanently delete')).toBeVisible()

  // Verify the "Delete forever" button is disabled when text doesn't match
  const deleteForeverBtn = page.getByRole('button', { name: 'Delete forever' })
  await expect(deleteForeverBtn).toBeDisabled()

  // Type DELETE to confirm
  await page.locator('#delete-confirm').fill('DELETE')

  // Button should now be enabled
  await expect(deleteForeverBtn).not.toBeDisabled()

  // Confirm deletion
  await deleteForeverBtn.click()

  // Wait for dialog to close and box to be gone
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Delete Test Box' })).not.toBeVisible()

  // Empty state should appear since this was the only box
  await expect(page.getByText('No PO boxes yet')).toBeVisible()
})
