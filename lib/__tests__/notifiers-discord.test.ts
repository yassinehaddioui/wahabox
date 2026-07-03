import { describe, it, expect, vi, afterEach } from 'vitest'

// ── hoisted mocks ──────────────────────────────────────────────────────────
const { mockLoggerError } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

// ── imports (after mocks) ─────────────────────────────────────────────────
import { DiscordNotifier } from '@/lib/notifiers/discord'
import type { ErrorEnvelope } from '@/lib/notifiers/types'

// ── helpers ────────────────────────────────────────────────────────────────

function makePayload(overrides?: Partial<ErrorEnvelope>): ErrorEnvelope {
  return {
    signature: 'sig_abc123',
    code: '5XX_TEST_ERROR',
    level: 'error',
    message: 'test error message',
    source: 'server',
    ts: '2026-07-03T12:00:00.000Z',
    env: 'staging',
    route: '/api/boxes/123',
    stackFirstFrame: 'Error: test error message\n    at handler (/app/handler.ts:42:3)\n    at runNextTicks (node:internal/process/task_queues:60:5)',
    ...overrides,
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('DiscordNotifier', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('URL unset — notify resolves, fetch NOT called', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', '')
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const notifier = new DiscordNotifier()
    await notifier.notify(makePayload())

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('URL set, 2xx response — fetch called once with valid embed', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const notifier = new DiscordNotifier()
    const payload = makePayload()
    await notifier.notify(payload)

    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://discord.com/api/webhooks/test')
    expect(opts.method).toBe('POST')
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )

    const body = JSON.parse(opts.body as string) as {
      embeds: Array<Record<string, unknown>>
    }
    const embed = body.embeds[0]

    // title
    expect(embed.title).toContain('[staging]')
    expect(embed.title).toContain('5XX_TEST_ERROR')
    expect(embed.title).toContain('/api/boxes/123')

    // color — error level
    expect(embed.color).toBe(0xed4245)

    // timestamp
    expect(embed.timestamp).toBe(payload.ts)

    // footer
    expect((embed.footer as { text: string }).text).toBe(
      payload.sha ?? 'unknown',
    )

    // required fields
    const fields = embed.fields as Array<{ name: string; inline: boolean }>
    const fieldNames = fields.map((f) => f.name)
    expect(fieldNames).toContain('level')
    expect(fieldNames).toContain('signature')
    expect(fieldNames).toContain('source')
    fields.forEach((f) => expect(f.inline).toBe(true))
  })

  it('fetch rejects (network error) — notify resolves, logger.error called', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    vi.stubGlobal('fetch', fetchMock)
    mockLoggerError.mockReset()

    const notifier = new DiscordNotifier()
    await expect(notifier.notify(makePayload())).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[discord] notify failed',
      expect.objectContaining({ reason: expect.stringContaining('ECONNRESET') }),
    )
  })

  it('fetch throws AbortError (timeout) — notify resolves, logger.error called', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), {
          name: 'AbortError',
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    mockLoggerError.mockReset()

    const notifier = new DiscordNotifier()
    await expect(notifier.notify(makePayload())).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[discord] notify failed',
      expect.objectContaining({ reason: expect.stringContaining('aborted') }),
    )
  })

  it('non-2xx response — notify resolves, logger.error called', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    vi.stubGlobal('fetch', fetchMock)
    mockLoggerError.mockReset()

    const notifier = new DiscordNotifier()
    await expect(notifier.notify(makePayload())).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[discord] non-2xx',
      expect.objectContaining({ status: 429 }),
    )
  })

  it('optional fields omitted — fields array excludes requestId, ip, sha', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const notifier = new DiscordNotifier()
    // payload without requestId, ip, sha
    const payload = makePayload({ requestId: undefined, ip: undefined, sha: undefined })
    await notifier.notify(payload)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      embeds: Array<Record<string, unknown>>
    }
    const fieldNames = (
      body.embeds[0].fields as Array<{ name: string }>
    ).map((f) => f.name)
    expect(fieldNames).not.toContain('requestId')
    expect(fieldNames).not.toContain('ip')
    expect(fieldNames).not.toContain('sha')
    // required fields still present
    expect(fieldNames).toContain('level')
    expect(fieldNames).toContain('signature')
    expect(fieldNames).toContain('source')
  })

  it('optional fields present — fields array includes requestId, ip, sha', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const notifier = new DiscordNotifier()
    const payload = makePayload({
      requestId: 'req-42',
      ip: '10.0.0.1',
      sha: 'abc123def456',
    })
    await notifier.notify(payload)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      embeds: Array<Record<string, unknown>>
    }
    const fieldNames = (
      body.embeds[0].fields as Array<{ name: string }>
    ).map((f) => f.name)
    expect(fieldNames).toContain('requestId')
    expect(fieldNames).toContain('ip')
    expect(fieldNames).toContain('sha')
  })

  it('warn level embed uses orange color', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const notifier = new DiscordNotifier()
    await notifier.notify(makePayload({ level: 'warn' }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      embeds: Array<Record<string, unknown>>
    }
    expect(body.embeds[0].color).toBe(0xfaa61a)
  })

  it('info level embed uses gray color', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const notifier = new DiscordNotifier()
    await notifier.notify(makePayload({ level: 'info' }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      embeds: Array<Record<string, unknown>>
    }
    expect(body.embeds[0].color).toBe(0x95a5a6)
  })

  it('description truncated to 1500 chars with … suffix', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const longFrame = 'A'.repeat(2000)
    const notifier = new DiscordNotifier()
    await notifier.notify(makePayload({ stackFirstFrame: longFrame }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      embeds: Array<Record<string, unknown>>
    }
    const desc = body.embeds[0].description as string
    expect(desc.length).toBeLessThanOrEqual(1501) // 1500 chars + possibly '…'
    expect(desc.endsWith('…')).toBe(true)
  })

  it('no description when stackFirstFrame is empty', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const notifier = new DiscordNotifier()
    await notifier.notify(makePayload({ stackFirstFrame: '' }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      embeds: Array<Record<string, unknown>>
    }
    expect(body.embeds[0].description).toBeUndefined()
  })

  it('sha in footer defaults to "unknown" when payload.sha missing', async () => {
    vi.stubEnv('DISCORD_WEBHOOK_URL', 'https://discord.com/api/webhooks/test')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const notifier = new DiscordNotifier()
    await notifier.notify(makePayload({ sha: undefined }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body) as {
      embeds: Array<Record<string, unknown>>
    }
    expect((body.embeds[0].footer as { text: string }).text).toBe('unknown')
  })
})
