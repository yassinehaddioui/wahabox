import { describe, it, expect } from 'vitest'
import {
  type ErrorEnvelope,
  type ErrorNotifier,
  type ErrorSource,
  type ErrorLevel,
} from '@/lib/notifiers/types'

// ---------------------------------------------------------------------------
// Satisfiability test — a real class that implements the interface.
// ---------------------------------------------------------------------------
class FakeNotifier implements ErrorNotifier {
  async notify(_payload: ErrorEnvelope): Promise<void> {
    // ok
  }
}

describe('ErrorNotifier interface', () => {
  it('FakeNotifier.notify is a function', () => {
    expect(new FakeNotifier().notify).toBeTypeOf('function')
  })
})

// ---------------------------------------------------------------------------
// Inverse compile regression guard.
//
// If ErrorNotifier ever stops requiring `notify` (e.g. someone changes it to
// an empty interface), this @ts-expect-error will become UNUSED and `tsc`
// will error — catching the regression at typecheck time.
// ---------------------------------------------------------------------------
class MissingNotify {}

// @ts-expect-error - MissingNotify does not implement ErrorNotifier.notify
const _bad: ErrorNotifier = new MissingNotify()

// ---------------------------------------------------------------------------
// ErrorEnvelope value tests.
// ---------------------------------------------------------------------------
describe('ErrorEnvelope construction', () => {
  it('compiles with all required fields', () => {
    const e: ErrorEnvelope = {
      signature: 's',
      code: 'c',
      level: 'error' as ErrorLevel,
      message: 'm',
      source: 'server' as ErrorSource,
      ts: new Date().toISOString(),
    }
    expect(e.source).toBe('server')
  })
})

// ---------------------------------------------------------------------------
// Inverse compile regression guard for ErrorEnvelope.
//
// If `source` ever becomes optional, this @ts-expect-error will become
// UNUSED and `tsc` will error — catching the regression.
// ---------------------------------------------------------------------------
// @ts-expect-error - missing required 'source' field
const _missingSource: ErrorEnvelope = {
  signature: 's',
  code: 'c',
  level: 'error' as ErrorLevel,
  message: 'm',
  ts: new Date().toISOString(),
}
