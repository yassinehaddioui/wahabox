import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestContext = {
  requestId: string
  route: string
  ip: string
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>()

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore()
}

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContextStorage.run(ctx, fn)
}

export function runWithRequestContextAsync<T>(
  ctx: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContextStorage.run(ctx, fn)
}

export function createRequestContext(
  overrides: Partial<RequestContext> = {},
): RequestContext {
  return {
    requestId: globalThis.crypto.randomUUID(),
    route: '/',
    ip: 'unknown',
    ...overrides,
  }
}
