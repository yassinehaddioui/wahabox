import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getRequestContext,
  runWithRequestContext,
  runWithRequestContextAsync,
  createRequestContext,
} from '@/lib/request-context'
import type { RequestContext } from '@/lib/request-context'
import crypto from 'node:crypto'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('request-context', () => {
  describe('getRequestContext / runWithRequestContext', () => {
    it('returns the context inside a runWithRequestContext', () => {
      const ctx: RequestContext = {
        requestId: 'r-123',
        route: '/test',
        ip: '1.2.3.4',
      }
      const result = runWithRequestContext(ctx, () => getRequestContext()?.requestId)
      expect(result).toBe('r-123')
    })

    it('returns undefined outside any runWithRequestContext', () => {
      expect(getRequestContext()).toBeUndefined()
    })

    it('restores outer context after nested inner run exits', () => {
      const outer: RequestContext = { requestId: 'outer', route: '/o', ip: '9.9.9.9' }
      const inner: RequestContext = { requestId: 'inner', route: '/i', ip: '1.1.1.1' }

      const result = runWithRequestContext(outer, () => {
        // Run inner and exit — should restore outer
        runWithRequestContext(inner, () => {
          // inside inner
          expect(getRequestContext()?.requestId).toBe('inner')
        })
        // now we should be back to outer
        return getRequestContext()?.requestId
      })

      expect(result).toBe('outer')
    })

    it('leak guard: returns undefined after runWithRequestContext exits', () => {
      runWithRequestContext(
        { requestId: 'leak-test', route: '/l', ip: '2.2.2.2' },
        () => {
          expect(getRequestContext()?.requestId).toBe('leak-test')
        },
      )
      // after exiting the run, context should be gone
      expect(getRequestContext()).toBeUndefined()
    })
  })

  describe('runWithRequestContextAsync', () => {
    it('preserves context across async boundaries', async () => {
      const ctx: RequestContext = { requestId: 'async', route: '/async', ip: '5.6.7.8' }

      const result = await runWithRequestContextAsync(ctx, async () => {
        await Promise.resolve()
        return getRequestContext()?.route
      })

      expect(result).toBe('/async')
    })

    it('leak guard: returns undefined after async run exits', async () => {
      await runWithRequestContextAsync(
        { requestId: 'async-leak', route: '/al', ip: '9.9.9.9' },
        async () => {
          await Promise.resolve()
          expect(getRequestContext()?.requestId).toBe('async-leak')
        },
      )

      // microtask flush
      await Promise.resolve()
      expect(getRequestContext()).toBeUndefined()
    })
  })

  describe('createRequestContext', () => {
    it('produces a valid UUID and default route/ip', () => {
      const ctx = createRequestContext()
      expect(ctx.requestId).toMatch(UUID_RE)
      expect(ctx.route).toBe('/')
      expect(ctx.ip).toBe('unknown')
    })

    it('merges overrides', () => {
      const ctx = createRequestContext({ route: '/custom', ip: '10.0.0.1' })
      expect(ctx.requestId).toMatch(UUID_RE)
      expect(ctx.route).toBe('/custom')
      expect(ctx.ip).toBe('10.0.0.1')
    })
  })

  describe('manual qa: real requestId captured', () => {
    it('captures a real UUID for evidence', () => {
      const ctx = createRequestContext()
      // Store on process.env for the evidence collection step
      const uuid = ctx.requestId
      expect(uuid).toMatch(UUID_RE)
      // Log it so the evidence script can capture it
      console.log('MANUAL_QA_UUID:', uuid)
    })
  })

  describe('structural regression guard: no node:crypto import', () => {
    it('source does not statically import node:crypto', () => {
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = dirname(__filename)
      const src = readFileSync(resolve(__dirname, '../request-context.ts'), 'utf8')
      expect(src).not.toMatch(/import .* from ['"]node:crypto['"]/)
    })
  })
})
