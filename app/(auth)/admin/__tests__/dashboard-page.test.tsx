// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import AdminDashboardPage from '@/app/(auth)/admin/(protected)/page'

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

function mockFetchResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

function mockStatsResponse(data: Record<string, number>) {
  return mockFetchResponse(200, { success: true, data })
}

function mockHealthResponse(data: Record<string, unknown>) {
  return mockFetchResponse(200, { success: true, data })
}

function mockRateLimitsResponse(data: Record<string, unknown>) {
  return mockFetchResponse(200, { success: true, data })
}

function mockErrorResponse(status = 500) {
  return mockFetchResponse(status, { success: false, error: 'Server error' })
}

function mockRejection() {
  return Promise.reject(new Error('Network error'))
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const defaultStats = {
    totalUsers: 42,
    totalBoxes: 15,
    totalMessages: 128,
    adminCount: 7,
    newUsers7d: 5,
    newBoxes7d: 2,
    newMessages7d: 18,
    newUsers30d: 12,
    newBoxes30d: 4,
    newMessages30d: 45,
    activeBoxes: 10,
    inactiveBoxes: 5,
  }

  const defaultHealth = {
    appVersion: '0.1.0',
    nodeEnv: 'development',
    dbConnected: true,
    redisConnected: true,
    emailConfigured: true,
    turnstileConfigured: false,
    adminPromoteConfigured: true,
  }

  const defaultRateLimits = {
    redisConnected: true,
    ipRateLimitKeys: 8,
    userRateLimitKeys: 13,
    globalRateLimitKey: 1,
    authFailureKeys: 2,
    dropCountKeys: 4,
  }

  it('renders loading skeletons while data is loading', () => {
    const pending = new Promise(() => {}) // never resolves
    mockFetch.mockImplementation(() => pending)

    render(<AdminDashboardPage />)
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('Server Health')).toBeInTheDocument()
    expect(screen.getByText('Rate Limits')).toBeInTheDocument()
  })

  it('renders all dashboard sections after successful fetch', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/stats') return mockStatsResponse(defaultStats)
      if (url === '/api/admin/health') return mockHealthResponse(defaultHealth)
      if (url === '/api/admin/rate-limits') return mockRateLimitsResponse(defaultRateLimits)
      return mockErrorResponse(404)
    })

    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    // Overview stats
    expect(screen.getByText('Total Users')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()

    // Activity
    expect(screen.getByText('New This Week')).toBeInTheDocument()
    expect(screen.getByText('New This Month')).toBeInTheDocument()
    expect(screen.getByText('Box Status')).toBeInTheDocument()

    // Health
    expect(screen.getByText('App Version')).toBeInTheDocument()
    expect(screen.getByText('0.1.0')).toBeInTheDocument()
    const configuredBadges = screen.getAllByText('Configured')
    expect(configuredBadges.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Not configured')).toBeInTheDocument()

    // Rate limits
    expect(screen.getByText('IP Rate Limit Keys')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
  })

  it('shows partial data when one endpoint fails (stats down)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/stats') return mockErrorResponse(500)
      if (url === '/api/admin/health') return mockHealthResponse(defaultHealth)
      if (url === '/api/admin/rate-limits') return mockRateLimitsResponse(defaultRateLimits)
      return mockErrorResponse(404)
    })

    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('App Version')).toBeInTheDocument()
    })

    // Stats section should show fallback
    expect(screen.getByText('Stats unavailable')).toBeInTheDocument()

    // Health should still render
    expect(screen.getByText('0.1.0')).toBeInTheDocument()

    // Rate limits should still render
    expect(screen.getByText('IP Rate Limit Keys')).toBeInTheDocument()

    // Error state should NOT show
    expect(screen.queryByText('Failed to load dashboard')).not.toBeInTheDocument()
  })

  it('shows partial data when one endpoint fails (rate-limits down)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/stats') return mockStatsResponse(defaultStats)
      if (url === '/api/admin/health') return mockHealthResponse(defaultHealth)
      if (url === '/api/admin/rate-limits') return mockRejection()
      return mockErrorResponse(404)
    })

    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    // Rate limits section should show fallback
    expect(screen.getByText('Rate limit data unavailable')).toBeInTheDocument()

    // Error state should NOT show
    expect(screen.queryByText('Failed to load dashboard')).not.toBeInTheDocument()
  })

  it('shows error state when all three endpoints fail', async () => {
    mockFetch.mockRejectedValue(new Error('All down'))

    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load dashboard')).toBeInTheDocument()
    })
  })

  it('shows error state when all endpoints return non-ok status', async () => {
    mockFetch.mockImplementation(() => mockErrorResponse(502))

    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load dashboard')).toBeInTheDocument()
    })
  })

  it('shows partial data when only stats succeeds', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/stats') return mockStatsResponse(defaultStats)
      if (url === '/api/admin/health') return mockRejection()
      if (url === '/api/admin/rate-limits') return mockRejection()
      return mockErrorResponse(404)
    })

    render(<AdminDashboardPage />)

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument()
    })

    expect(screen.getByText('Health data unavailable')).toBeInTheDocument()
    expect(screen.getByText('Rate limit data unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load dashboard')).not.toBeInTheDocument()
  })
})
