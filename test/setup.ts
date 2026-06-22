// Test setup — loaded by vitest before every test file (see vitest.config.ts setupFiles).
// Sets test-safe env defaults BEFORE any module reads them, registers jest-dom
// matchers, and resets mocks between tests to prevent cross-test contamination.

// 1. Env defaults — assigned first so any module imported by test files sees them.
//    These are fake values, safe to commit; never use real secrets in tests.
process.env.SERVER_MASTER_SECRET = Buffer.from(
  'test-master-secret-32-bytes-long-for-unit-tests',
  'utf8',
).toString('base64')
process.env.SESSION_SECRET = 'test-session-secret-not-for-production'
process.env.APP_URL = 'http://localhost:3000'
process.env.APP_MODE = 'development'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/wahabox_test'
process.env.REDIS_URL = 'redis://localhost:6379'

// 2. jest-dom matchers (toBeInTheDocument, toHaveTextContent, etc.)
import '@testing-library/jest-dom'

// 3. Mock reset between tests — prevents cross-test contamination.
import { afterEach, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
