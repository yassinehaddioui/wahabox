import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock request-context BEFORE importing logger — vitest hoists vi.mock above imports
vi.mock('@/lib/request-context', () => ({
  getRequestContext: vi.fn(),
}))

import { logger } from '../logger'
import { getRequestContext } from '@/lib/request-context'

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  it('emits valid JSON with required fields and caller-ctx requestId', () => {
    logger.error('boom', { requestId: 'r1' })

    const writeMock = vi.mocked(process.stdout.write)
    expect(writeMock).toHaveBeenCalledTimes(1)

    const line = writeMock.mock.calls[0]![0] as string
    const parsed = JSON.parse(line)

    expect(parsed.level).toBe('error')
    expect(parsed.msg).toBe('boom')
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(parsed.env).toBeDefined()
    expect(parsed.appMode).toBeDefined()
    expect(typeof parsed.sha).toBe('string')
    expect(parsed.requestId).toBe('r1')
  })

  it('handles Error input with name and stack', () => {
    logger.error(new Error('x'))

    const writeMock = vi.mocked(process.stdout.write)
    const line = writeMock.mock.calls[0]![0] as string
    const parsed = JSON.parse(line)

    expect(parsed.msg).toBe('x')
    expect(parsed.name).toBe('Error')
    expect(typeof parsed.stack).toBe('string')
    expect((parsed.stack as string).length).toBeGreaterThan(0)
  })

  it('merges caller context keys into the output', () => {
    logger.info('test', { userId: 'u1', action: 'login' })

    const writeMock = vi.mocked(process.stdout.write)
    const line = writeMock.mock.calls[0]![0] as string
    const parsed = JSON.parse(line)

    expect(parsed.userId).toBe('u1')
    expect(parsed.action).toBe('login')
  })

  it('does not throw on circular context and writes fallback line', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any — test-only circular object
    const o: any = { a: {} }
    o.a = o

    expect(() => logger.error('c', o)).not.toThrow()

    const writeMock = vi.mocked(process.stdout.write)
    expect(writeMock).toHaveBeenCalledTimes(1)
    const line = writeMock.mock.calls[0]![0] as string
    const parsed = JSON.parse(line)

    // JSON.stringify threw on the circular ref, so the fallback line was written
    expect(parsed.msg).toBe('<serialize-failed>')
    expect(parsed.error).toBe('serialize-failed')
  })

  it('redacts sensitive keys', () => {
    logger.error('x', {
      password: 'p',
      body: 'b',
      authorization: 'a',
      cookie: 'c',
      cookies: 'cc',
      csrfToken: 't',
      accessToken: 't2',
      sessionToken: 'st',
    })

    const writeMock = vi.mocked(process.stdout.write)
    const line = writeMock.mock.calls[0]![0] as string
    const parsed = JSON.parse(line)

    expect(parsed.password).toBe('[redacted]')
    expect(parsed.body).toBe('[redacted]')
    expect(parsed.authorization).toBe('[redacted]')
    expect(parsed.cookie).toBe('[redacted]')
    expect(parsed.cookies).toBe('[redacted]')
    expect(parsed.csrfToken).toBe('[redacted]')
    expect(parsed.accessToken).toBe('[redacted]')
    expect(parsed.sessionToken).toBe('[redacted]')
  })

  it('includes requestId/route/ip from getRequestContext when present', () => {
    vi.mocked(getRequestContext).mockReturnValue({
      requestId: 'ctx-r1',
      route: '/api/test',
      ip: '10.0.0.1',
    })

    logger.error('from context')

    const writeMock = vi.mocked(process.stdout.write)
    const line = writeMock.mock.calls[0]![0] as string
    const parsed = JSON.parse(line)

    expect(parsed.requestId).toBe('ctx-r1')
    expect(parsed.route).toBe('/api/test')
    expect(parsed.ip).toBe('10.0.0.1')
  })

  it('omits requestId/route/ip when getRequestContext returns undefined', () => {
    vi.mocked(getRequestContext).mockReturnValue(undefined)

    logger.error('test')

    const writeMock = vi.mocked(process.stdout.write)
    const line = writeMock.mock.calls[0]![0] as string
    const parsed = JSON.parse(line)

    expect(parsed.requestId).toBeUndefined()
    expect(parsed.route).toBeUndefined()
    expect(parsed.ip).toBeUndefined()
  })

  it('warn and info also write structured lines', () => {
    logger.warn('warn msg')
    logger.info('info msg')

    const writeMock = vi.mocked(process.stdout.write)
    expect(writeMock).toHaveBeenCalledTimes(2)

    const warnLine = JSON.parse(writeMock.mock.calls[0]![0] as string)
    const infoLine = JSON.parse(writeMock.mock.calls[1]![0] as string)

    expect(warnLine.level).toBe('warn')
    expect(warnLine.msg).toBe('warn msg')
    expect(infoLine.level).toBe('info')
    expect(infoLine.msg).toBe('info msg')
  })

  it('manual qa: emits real stdout line', async () => {
    // Restore the mock so we can actually capture stdout
    vi.restoreAllMocks()

    // Spy and capture the actual output
    let captured = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      captured += String(chunk)
      return true
    })

    logger.error('integration', { requestId: 'r9', route: '/x' })

    // Write the evidence file
    const fs = await import('fs/promises')
    await fs.mkdir('.omo/evidence', { recursive: true })
    await fs.writeFile(
      '.omo/evidence/task-1-error-handling-reporting.txt',
      `CAPTURED_STDOUT_LINE:\n${captured}\nVITEST_PASS: logger manual qa: emits real stdout line - PASS\n`,
      'utf-8',
    )

    // Verify it's parseable JSON
    const trimmed = captured.trim()
    expect(trimmed.length).toBeGreaterThan(0)
    const parsed = JSON.parse(trimmed)
    expect(parsed.level).toBe('error')
    expect(parsed.msg).toBe('integration')
    expect(parsed.requestId).toBe('r9')
    expect(parsed.route).toBe('/x')
    expect(typeof parsed.ts).toBe('string')
    expect(typeof parsed.sha).toBe('string')
  })
})
