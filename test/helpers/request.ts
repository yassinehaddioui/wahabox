import { NextRequest } from 'next/server'

type CreateNextRequestOptions = {
  method?: string
  body?: unknown
  cookies?: Record<string, string>
  headers?: Record<string, string>
}

/**
 * Build a NextRequest with a JSON-stringified body, Content-Type: application/json,
 * and a cookie jar readable via request.cookies.get(name).
 */
export function createNextRequest(
  url: string,
  options: CreateNextRequestOptions = {},
): NextRequest {
  const { method = 'GET', body, cookies = {}, headers = {} } = options

  // Use Headers for case-insensitive key handling so user-supplied
  // "content-type" merges with rather than duplicates our default.
  const headerInit = new Headers({ 'Content-Type': 'application/json' })
  for (const [key, value] of Object.entries(headers)) {
    headerInit.set(key, value)
  }

  const cookieString = Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')

  if (cookieString) {
    headerInit.set('Cookie', cookieString)
  }

  const init = {
    method,
    headers: headerInit,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }

  return new NextRequest(url, init)
}

/**
 * Build the dynamic route handler context shape used by Next.js App Router:
 * `{ params: Promise<T> }`.
 */
export function createRouteContext<T extends Record<string, string>>(
  params: T,
): { params: Promise<T> } {
  return { params: Promise.resolve(params) }
}
