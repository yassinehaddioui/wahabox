import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setSessionKeys,
  getSessionKeys,
  clearSessionKeys,
  PRIVATE_KEY_STORAGE_KEY,
  PUBLIC_KEY_STORAGE_KEY,
} from '@/lib/session-keys'

type Stored = Map<string, string>

interface MockStorage extends Storage {
  _store: Stored
}

function makeStorage(store: Stored): MockStorage {
  const s: MockStorage = {
    _store: store,
    get length() {
      return store.size
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
  }
  return s
}

interface MockWindow {
  addEventListener: (type: string, cb: (e: StorageEvent) => void) => void
  removeEventListener: (type: string, cb: (e: StorageEvent) => void) => void
}

interface GlobalWithStorages {
  sessionStorage: Storage
  localStorage: Storage
  window: Window | undefined
}

const g = globalThis as unknown as GlobalWithStorages

let sessionStore: Stored
let localStore: Stored
let listeners: ((e: StorageEvent) => void)[]
let savedWindow: Window | undefined

beforeEach(() => {
  sessionStore = new Map()
  localStore = new Map()
  listeners = []
  savedWindow = g.window

  g.sessionStorage = makeStorage(sessionStore)
  g.localStorage = makeStorage(localStore)

  const mockWindow: MockWindow = {
    addEventListener: (_type, cb) => {
      listeners.push(cb)
    },
    removeEventListener: (_type, cb) => {
      listeners = listeners.filter((l) => l !== cb)
    },
  }
  g.window = mockWindow as unknown as Window
})

afterEach(() => {
  g.window = savedWindow
  vi.restoreAllMocks()
})

function dispatchStorageEvent(key: string | null, newValue: string | null) {
  const event = { key, newValue } as StorageEvent
  listeners.forEach((l) => l(event))
}

describe('session-keys', () => {
  it('setSessionKeys writes to both sessionStorage and localStorage', () => {
    setSessionKeys('priv-b64', 'pub-b64')
    expect(sessionStore.get(PRIVATE_KEY_STORAGE_KEY)).toBe('priv-b64')
    expect(sessionStore.get(PUBLIC_KEY_STORAGE_KEY)).toBe('pub-b64')
    expect(localStore.get(PRIVATE_KEY_STORAGE_KEY)).toBe('priv-b64')
    expect(localStore.get(PUBLIC_KEY_STORAGE_KEY)).toBe('pub-b64')
  })

  it('getSessionKeys returns keys when present in sessionStorage', () => {
    setSessionKeys('priv-b64', 'pub-b64')
    expect(getSessionKeys()).toEqual({
      privateKey: 'priv-b64',
      publicKey: 'pub-b64',
    })
  })

  it('getSessionKeys returns null when neither store has keys', () => {
    expect(getSessionKeys()).toBeNull()
  })

  it('getSessionKeys falls back to localStorage and seeds sessionStorage', () => {
    localStore.set(PRIVATE_KEY_STORAGE_KEY, 'priv-b64')
    localStore.set(PUBLIC_KEY_STORAGE_KEY, 'pub-b64')
    sessionStore.clear()

    const keys = getSessionKeys()

    expect(keys).toEqual({ privateKey: 'priv-b64', publicKey: 'pub-b64' })
    expect(sessionStore.get(PRIVATE_KEY_STORAGE_KEY)).toBe('priv-b64')
    expect(sessionStore.get(PUBLIC_KEY_STORAGE_KEY)).toBe('pub-b64')
  })

  it('getSessionKeys returns null if only one key is present', () => {
    localStore.set(PRIVATE_KEY_STORAGE_KEY, 'priv-b64')
    expect(getSessionKeys()).toBeNull()
  })

  it('clearSessionKeys removes from both stores', () => {
    setSessionKeys('priv-b64', 'pub-b64')
    clearSessionKeys()
    expect(sessionStore.has(PRIVATE_KEY_STORAGE_KEY)).toBe(false)
    expect(sessionStore.has(PUBLIC_KEY_STORAGE_KEY)).toBe(false)
    expect(localStore.has(PRIVATE_KEY_STORAGE_KEY)).toBe(false)
    expect(localStore.has(PUBLIC_KEY_STORAGE_KEY)).toBe(false)
  })

  it('storage event with newValue=null triggers a clear that empties both stores', () => {
    setSessionKeys('priv-b64', 'pub-b64')

    listeners.push(() => {
      clearSessionKeys()
    })

    dispatchStorageEvent(PRIVATE_KEY_STORAGE_KEY, null)

    expect(getSessionKeys()).toBeNull()
    expect(sessionStore.has(PRIVATE_KEY_STORAGE_KEY)).toBe(false)
    expect(localStore.has(PRIVATE_KEY_STORAGE_KEY)).toBe(false)
  })

  it('storage event with non-null newValue does not trigger a clear', () => {
    setSessionKeys('priv-b64', 'pub-b64')

    let cleared = false
    listeners.push(() => {
      if (getSessionKeys() === null) cleared = true
    })

    dispatchStorageEvent(PRIVATE_KEY_STORAGE_KEY, 'new-priv')

    expect(cleared).toBe(false)
    expect(getSessionKeys()).not.toBeNull()
  })

  it('no-ops when window is undefined (SSR)', () => {
    delete g.window
    expect(() => setSessionKeys('a', 'b')).not.toThrow()
    expect(getSessionKeys()).toBeNull()
    expect(() => clearSessionKeys()).not.toThrow()
  })
})
