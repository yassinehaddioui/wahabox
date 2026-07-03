/**
 * E2E test: error boundary renders and reports via POST /api/report-error.
 *
 * REQUIRES the Docker dev stack to be running (Caddy → Next.js).
 * Navigates to /throw-test, intercepts the /api/report-error POST, and
 * asserts the boundary renders + the captured body is sanitized.
 *
 * NOTE: This test depends on a throwaway page at app/throw-test/page.tsx.
 * When the middleware.ts edge runtime issue is fixed (node:crypto not
 * available in edge), remove this comment and run:
 *   pnpm test:e2e -- error-boundary-report
 */
import { test, expect } from '@playwright/test'

test('error boundary renders and POSTs sanitized report', async ({ page }) => {
  const capturedBodies: string[] = []

  // Intercept the /api/report-error POST to capture the body
  await page.route('**/api/report-error', async (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      capturedBodies.push(req.postData() ?? '')
    }
    await route.fulfill({ status: 202, body: JSON.stringify({ ok: true }) })
  })

  // Navigate to the throwaway page that triggers error.tsx
  await page.goto('/throw-test', { waitUntil: 'domcontentloaded' })

  // Assert the recovery UI rendered
  await expect(page.getByText('Something went wrong')).toBeVisible({ timeout: 10000 })
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /reload page/i })).toBeVisible()

  // Assert the fetch was intercepted
  expect(capturedBodies).toHaveLength(1)

  const body = JSON.parse(capturedBodies[0])
  expect(body).toHaveProperty('message')
  expect(body).toHaveProperty('code')
  expect(body).toHaveProperty('stackFirstFrame')
  expect(body).toHaveProperty('route')
  expect(body.route).toBe('/throw-test')

  // Sanitization: the email in the error message must be redacted
  expect(body.message).not.toMatch(/@/)
  expect(body.message).toContain('[redacted]')
})
