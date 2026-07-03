import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Module-level mocks — hoisted by vitest.
vi.mock('@/lib/env', () => ({
  validateEnv: vi.fn(),
}))

vi.mock('@/lib/reporter', () => ({
  reportError: vi.fn().mockResolvedValue(undefined),
}))

// ── BASELINE TESTS ──────────────────────────────────────────────────────────
// Characterize EXISTING instrumentation.ts behavior (validateEnv-based).
// These must pass on UNCHANGED code before any process.on hooks are added.
// No vi.resetModules() — no module-scope state to reset for baseline.

describe('instrumentation - baseline', () => {
  let register: () => Promise<void>
  let validateEnv: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    // Dynamic re-imports ensure we always get the active mock instance.
    const envMod = await import('@/lib/env')
    validateEnv = envMod.validateEnv as ReturnType<typeof vi.fn>

    const instrMod = await import('@/instrumentation')
    register = instrMod.register

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('register is exported and is an async function', () => {
    expect(typeof register).toBe('function')
    expect(register()).toBeInstanceOf(Promise)
  })

  it('calls validateEnv when NEXT_RUNTIME is nodejs', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    await register()
    expect(validateEnv).toHaveBeenCalledOnce()
  })

  it('does NOT call validateEnv when NEXT_RUNTIME is not nodejs (edge)', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await register()
    expect(validateEnv).not.toHaveBeenCalled()
  })

  it('does NOT call validateEnv when NEXT_RUNTIME is unset', async () => {
    // NEXT_RUNTIME is unset by default (setup.ts does not define it)
    await register()
    expect(validateEnv).not.toHaveBeenCalled()
  })
})

// ── HOOKS TESTS (failing-first) ────────────────────────────────────────────

describe('instrumentation - process hooks', () => {
  let register: () => Promise<void>
  let reportError: ReturnType<typeof vi.fn>
  let listeners: Map<string, (arg: unknown) => void>
  let exitCodes: number[]

  beforeEach(async () => {
    vi.useRealTimers()
    vi.resetModules()

    listeners = new Map()
    exitCodes = []

    vi.spyOn(process, 'on').mockImplementation(((
      event: string | symbol,
      listener: (...args: unknown[]) => void,
    ) => {
      listeners.set(String(event), listener)
      return process
    }) as typeof process.on)

    vi.spyOn(process, 'exit').mockImplementation(((code?: number): never => {
      exitCodes.push(code ?? 0)
      return undefined as never
    }) as typeof process.exit)

    const reporterMod = await import('@/lib/reporter')
    reportError = reporterMod.reportError as ReturnType<typeof vi.fn>

    const instrMod = await import('@/instrumentation')
    register = instrMod.register

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  function getHandler(event: string): (arg: unknown) => void {
    const handler = listeners.get(event)
    if (!handler) throw new Error(`No handler registered for event: ${event}`)
    return handler
  }

  it('registers process.on handlers for unhandledRejection AND uncaughtException in nodejs mode', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    await register()

    expect(listeners.has('unhandledRejection')).toBe(true)
    expect(listeners.has('uncaughtException')).toBe(true)
  })

  it('does NOT register any process.on handlers when NEXT_RUNTIME is not nodejs', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await register()

    expect(listeners.size).toBe(0)
  })

  it('unhandledRejection handler calls reportError with source:process', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    await register()

    const handler = getHandler('unhandledRejection')
    const testErr = new Error('rejection reason')
    handler(testErr)

    expect(reportError).toHaveBeenCalledWith(testErr, { source: 'process' })
  })

  it('uncaughtException in development: calls reportError, does NOT call process.exit', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('NODE_ENV', 'development')
    await register()

    const handler = getHandler('uncaughtException')
    const testErr = new Error('dev crash')
    handler(testErr)

    expect(reportError).toHaveBeenCalledWith(testErr, { source: 'process' })
    expect(exitCodes).toHaveLength(0)
  })

  it('uncaughtException in production: schedules process.exit(1) after 1 second', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('NODE_ENV', 'production')

    vi.useFakeTimers()
    await register()

    const handler = getHandler('uncaughtException')
    const testErr = new Error('prod crash')
    handler(testErr)

    expect(reportError).toHaveBeenCalledWith(testErr, { source: 'process' })
    expect(exitCodes).toHaveLength(0)

    vi.advanceTimersByTime(1001)

    expect(exitCodes).toEqual([1])
  })

  it('exiting guard: uncaughtException twice in production calls process.exit exactly once', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    vi.stubEnv('NODE_ENV', 'production')

    vi.useFakeTimers()
    await register()

    const handler = getHandler('uncaughtException')

    handler(new Error('first crash'))
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(exitCodes).toHaveLength(0)

    handler(new Error('second crash'))
    expect(reportError).toHaveBeenCalledTimes(2)
    expect(exitCodes).toHaveLength(0)

    vi.advanceTimersByTime(1001)

    expect(exitCodes).toEqual([1])
  })
})
