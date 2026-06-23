import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { resetRedisMock } from '@/test/helpers/redis-mock'

vi.mock('@/lib/prisma', () => ({ default: { $queryRaw: vi.fn() } }))

import prisma from '@/lib/prisma'

const redisMockCtrl = vi.hoisted(() => {
  let _ping: () => Promise<unknown> = () => Promise.resolve('PONG')
  return {
    setPing: (fn: () => Promise<unknown>) => {
      _ping = fn
    },
    getPing: () => _ping,
  }
})

vi.mock('@/lib/redis', () => ({
  getRedis: async () => ({ ping: redisMockCtrl.getPing() }),
  withRedis: async <T>(fn: (redis: unknown) => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn({ ping: redisMockCtrl.getPing() })
    } catch {
      return fallback
    }
  },
  closeRedis: async () => {},
}))

const URL = 'http://localhost/api/healthz'

describe('GET /api/healthz', () => {
  beforeEach(() => {
    resetRedisMock()
    vi.clearAllMocks()
    redisMockCtrl.setPing(vi.fn().mockResolvedValue('PONG'))
  })

  it('returns 200 when both postgres and redis are reachable', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }])

    const res = await GET(createNextRequest(URL))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.postgres).toBe('ok')
    expect(body.data.redis).toBe('ok')
  })

  it('returns 503 with postgres down when prisma fails', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('connection refused'))

    const res = await GET(createNextRequest(URL))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Service unavailable')
    expect(body.checks.postgres).toBe('down')
    expect(body.checks.redis).toBe('ok')
  })

  it('returns 503 with redis down when redis ping fails', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }])
    redisMockCtrl.setPing(vi.fn().mockRejectedValue(new Error('connection refused')))

    const res = await GET(createNextRequest(URL))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Service unavailable')
    expect(body.checks.postgres).toBe('ok')
    expect(body.checks.redis).toBe('down')
  })

  it('returns 503 with both down when both checks fail', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('connection refused'))
    redisMockCtrl.setPing(vi.fn().mockRejectedValue(new Error('connection refused')))

    const res = await GET(createNextRequest(URL))
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Service unavailable')
    expect(body.checks.postgres).toBe('down')
    expect(body.checks.redis).toBe('down')
  })

  it('returns 503 with postgres timeout when prisma hangs', async () => {
    vi.useFakeTimers()
    vi.mocked(prisma.$queryRaw).mockReturnValue(new Promise(() => {}) as any)
    redisMockCtrl.setPing(vi.fn().mockResolvedValue('PONG'))

    const reqPromise = GET(createNextRequest(URL))

    // Flush microtasks so checkRedis (getRedis -> ping) resolves before timers fire
    await new Promise<void>((resolve) => resolve())
    vi.advanceTimersByTime(5000)

    const res = await reqPromise
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Service unavailable')
    expect(body.checks.postgres).toBe('timeout')

    vi.useRealTimers()
  })
})
