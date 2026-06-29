import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { clearRateLimits } from './helpers'

// ── Helpers ──────────────────────────────────────────────────────────────

/** Read ADMIN_PROMOTE_TOKEN from env or .env.local. Returns empty string if not configured. */
function getAdminPromoteToken(): string {
  if (process.env.ADMIN_PROMOTE_TOKEN) return process.env.ADMIN_PROMOTE_TOKEN
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
    const match = content.match(/^ADMIN_PROMOTE_TOKEN=(.+)$/m)
    if (match) return match[1].trim()
  } catch {
    /* best-effort */
  }
  return ''
}

/** Sign up a new account and log in. Returns the username and password. */
async function signupAndLogin(page: Page): Promise<{ username: string; password: string }> {
  const username = `admin_e2e_${crypto.randomUUID().slice(0, 8)}`
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

/**
 * Promote the currently logged-in user via the admin-promote form.
 * Navigates to /admin-promote, fills the token, submits.
 * On success the user is redirected to /admin.
 */
async function promoteViaForm(page: Page, token: string): Promise<void> {
  await page.goto('/admin-promote')
  await page.waitForURL('/admin-promote')

  // Wait for CSRF token fetch to finish (input becomes enabled)
  await page.waitForSelector('#promote-token:enabled', { timeout: 10000 })

  await page.fill('#promote-token', token)
  await page.getByRole('button', { name: 'Promote to Admin' }).click()

  // On success the form redirects to /admin
  await page.waitForURL('/admin', { timeout: 15000 })
}

test.beforeEach(() => clearRateLimits())

// ── Tests ────────────────────────────────────────────────────────────────

test('admin promotion flow — signup, promote, verify redirect', async ({ page }) => {
  const token = getAdminPromoteToken()
  if (!token) test.skip(true, 'ADMIN_PROMOTE_TOKEN not configured')

  await signupAndLogin(page)
  await promoteViaForm(page, token)

  // Verify we landed on the admin dashboard
  await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible()
  // Admin nav tabs should be present
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Audit Log' })).toBeVisible()
})

test('view admin dashboard stats', async ({ page }) => {
  const token = getAdminPromoteToken()
  if (!token) test.skip(true, 'ADMIN_PROMOTE_TOKEN not configured')

  await signupAndLogin(page)
  await promoteViaForm(page, token)

  // Dashboard sections should render (they fetch /api/admin/stats, /api/admin/health, /api/admin/rate-limits)
  await expect(page.getByText('Overview')).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Activity')).toBeVisible()
  await expect(page.getByText('Secure Messages')).toBeVisible()
  await expect(page.getByText('Server Health')).toBeVisible()
  await expect(page.getByText('Rate Limits')).toBeVisible()

  // At least one stat card should show a value (Total Users)
  await expect(page.getByText('Total Users')).toBeVisible()
  await expect(page.getByText('Total Boxes')).toBeVisible()
  await expect(page.getByText('Admins')).toBeVisible()
})

test('view user list', async ({ page }) => {
  const token = getAdminPromoteToken()
  if (!token) test.skip(true, 'ADMIN_PROMOTE_TOKEN not configured')

  const { username } = await signupAndLogin(page)
  await promoteViaForm(page, token)

  // Navigate to users page via admin nav
  await page.getByRole('link', { name: 'Users' }).click()
  await page.waitForURL('/admin/users')

  // The table should render and contain our promoted user
  await expect(page.getByRole('columnheader', { name: 'Username' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('columnheader', { name: 'Role' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'MFA' })).toBeVisible()

  // Our user should appear with role "Admin"
  await expect(page.getByRole('cell', { name: username })).toBeVisible()
  // The role badge should show "Admin" for the promoted user
  await expect(page.getByRole('cell', { name: 'Admin' }).first()).toBeVisible()

  // Search should work
  await page.getByLabel('Search by username').fill(username)
  await expect(page.getByRole('cell', { name: username })).toBeVisible()

  // Role filter should work
  await page.getByLabel('Filter by role').click()
  await page.getByRole('option', { name: 'Admin' }).click()
  await expect(page.getByRole('cell', { name: username })).toBeVisible()
})

test('view audit log with promotion entry', async ({ page }) => {
  const token = getAdminPromoteToken()
  if (!token) test.skip(true, 'ADMIN_PROMOTE_TOKEN not configured')

  const { username } = await signupAndLogin(page)
  await promoteViaForm(page, token)

  // Navigate to audit log via admin nav
  await page.getByRole('link', { name: 'Audit Log' }).click()
  await page.waitForURL('/admin/audit-log')

  // The table should render with column headers
  await expect(page.getByRole('columnheader', { name: 'Timestamp' })).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('columnheader', { name: 'Actor' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Action' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Target' })).toBeVisible()

  // The promotion should have created an audit log entry for our user
  await expect(page.getByRole('cell', { name: username }).first()).toBeVisible()
  await expect(page.getByText('Promoted user').first()).toBeVisible()

  // Action filter should work
  await page.getByLabel('Filter by action').click()
  await page.getByRole('option', { name: 'Promoted user' }).click()
  await expect(page.getByRole('cell', { name: username }).first()).toBeVisible()
  await expect(page.getByText('Promoted user').first()).toBeVisible()
})

test('non-admin users cannot access admin routes', async ({ page }) => {
  await signupAndLogin(page)

  // ── Page-level: /admin redirects non-admin to /admin-promote ──
  await page.goto('/admin')
  await page.waitForURL('/admin-promote')
  await expect(page.getByRole('heading', { name: 'Admin Promotion' })).toBeVisible()

  // ── Page-level: /admin/users also redirects ──
  await page.goto('/admin/users')
  await page.waitForURL('/admin-promote')

  // ── Page-level: /admin/audit-log also redirects ──
  await page.goto('/admin/audit-log')
  await page.waitForURL('/admin-promote')

  // ── API-level: non-admin fetching /api/admin/stats gets 403 ──
  const statsResult = await page.evaluate(async () => {
    const res = await fetch('/api/admin/stats')
    return { status: res.status, body: await res.json() }
  })
  expect(statsResult.status).toBe(403)
  expect(statsResult.body.success).toBe(false)
  expect(statsResult.body.code).toBe('FORBIDDEN')

  // ── API-level: non-admin fetching /api/admin/users gets 403 ──
  const usersResult = await page.evaluate(async () => {
    const res = await fetch('/api/admin/users')
    return { status: res.status, body: await res.json() }
  })
  expect(usersResult.status).toBe(403)
  expect(usersResult.body.success).toBe(false)
  expect(usersResult.body.code).toBe('FORBIDDEN')

  // ── API-level: non-admin fetching /api/admin/audit-log gets 403 ──
  const auditResult = await page.evaluate(async () => {
    const res = await fetch('/api/admin/audit-log')
    return { status: res.status, body: await res.json() }
  })
  expect(auditResult.status).toBe(403)
  expect(auditResult.body.success).toBe(false)
  expect(auditResult.body.code).toBe('FORBIDDEN')

  // User stays logged in and can still access their dashboard
  await page.goto('/dashboard')
  await expect(page.locator('h1')).toHaveText('Boxes')
  await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
})
