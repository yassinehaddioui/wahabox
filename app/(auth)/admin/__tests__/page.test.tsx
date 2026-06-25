// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminDashboardPage from '@/app/(auth)/admin/(protected)/page'

const originalFetch = globalThis.fetch

function okJson(data: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) })
}

describe('AdminDashboardPage (old test migrated)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}))
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('renders the page structure (section headings) while loading', () => {
    render(<AdminDashboardPage />)
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('Server Health')).toBeInTheDocument()
    expect(screen.getByText('Rate Limits')).toBeInTheDocument()
  })

  it('renders the Dashboard stats cards after successful fetch', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/admin/stats')
        return okJson({ success: true, data: { totalUsers: 42, totalBoxes: 15, totalMessages: 128, adminCount: 7, newUsers7d: 0, newBoxes7d: 0, newMessages7d: 0, newUsers30d: 0, newBoxes30d: 0, newMessages30d: 0, activeBoxes: 10, inactiveBoxes: 5 } })
      if (url === '/api/admin/health')
        return okJson({ success: true, data: { appVersion: '0.1.0', nodeEnv: 'development', dbConnected: true, redisConnected: true, emailConfigured: false, turnstileConfigured: false, adminPromoteConfigured: false } })
      if (url === '/api/admin/rate-limits')
        return okJson({ success: true, data: { redisConnected: true, ipRateLimitKeys: 0, userRateLimitKeys: 0, globalRateLimitKey: 0, authFailureKeys: 0, dropCountKeys: 0 } })
      return okJson({ success: false, error: 'not found' })
    })

    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('Total Boxes')).toBeInTheDocument()
  })
})
