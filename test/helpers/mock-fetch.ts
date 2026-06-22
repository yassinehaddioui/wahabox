import { vi, type Mock } from 'vitest'

/**
 * Partial Response shape for mocking `global.fetch`.
 * Provide only the methods/properties the test exercises;
 * omitted fields get sensible defaults.
 *
 * `json` and `text` may return either a plain value or a Promise —
 * the wrapper normalizes both to `Promise.resolve(...)`.
 */
export interface MockResponse {
  ok?: boolean
  status?: number
  statusText?: string
  headers?: Headers
  json?: () => Promise<unknown> | unknown
  text?: () => Promise<string> | string
  arrayBuffer?: () => Promise<ArrayBuffer> | ArrayBuffer
  blob?: () => Promise<Blob> | Blob
  clone?: () => Response
}

type ResponseOrResponses = MockResponse | MockResponse[]

let savedFetch: typeof globalThis.fetch | null = null
let responses: MockResponse[] = []
let callIndex = 0

function buildResponse(mock: MockResponse): Response {
  const status = mock.status ?? 200
  const response: Partial<Response> = {
    ok: mock.ok ?? (status >= 200 && status < 300),
    status,
    statusText: mock.statusText ?? (status === 200 ? 'OK' : ''),
    headers: mock.headers ?? new Headers(),
    json: () => Promise.resolve(mock.json?.() ?? {}),
    text: () => Promise.resolve(mock.text?.() ?? ''),
  }
  if (mock.arrayBuffer) {
    response.arrayBuffer = () => Promise.resolve(mock.arrayBuffer!())
  }
  if (mock.blob) {
    response.blob = () => Promise.resolve(mock.blob!())
  }
  if (mock.clone) {
    response.clone = mock.clone
  }
  return response as Response
}

/**
 * Stub `global.fetch` with a single response or an array of sequential
 * responses. When given an array, the Nth fetch call returns the Nth
 * response; calls beyond the array length reuse the last response.
 *
 * Returns the underlying `vi.fn` mock so tests can assert on call
 * count, URL, or init arguments.
 */
export function mockFetch(responseOrResponses: ResponseOrResponses): Mock<typeof fetch> {
  responses = Array.isArray(responseOrResponses) ? responseOrResponses : [responseOrResponses]
  callIndex = 0
  if (savedFetch === null) {
    savedFetch = globalThis.fetch
  }
  const stub = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const mock = responses[callIndex] ?? responses[responses.length - 1]
    callIndex++
    return buildResponse(mock)
  }) as Mock<typeof fetch>
  globalThis.fetch = stub
  return stub
}

/**
 * Restore the original `global.fetch`. Safe to call even if
 * `mockFetch` was never called.
 */
export function resetMockFetch(): void {
  if (savedFetch !== null) {
    globalThis.fetch = savedFetch
    savedFetch = null
  }
  responses = []
  callIndex = 0
}
