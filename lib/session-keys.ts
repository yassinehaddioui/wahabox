export const PRIVATE_KEY_STORAGE_KEY = 'session:privateKey'
export const PUBLIC_KEY_STORAGE_KEY = 'session:publicKey'

type SessionKeys = { privateKey: string; publicKey: string } | null

export function setSessionKeys(privateKey: string, publicKey: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privateKey)
    sessionStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKey)
    localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privateKey)
    localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKey)
  } catch {}
}

export function getSessionKeys(): SessionKeys {
  if (typeof window === 'undefined') return null
  try {
    let privateKey = sessionStorage.getItem(PRIVATE_KEY_STORAGE_KEY)
    let publicKey = sessionStorage.getItem(PUBLIC_KEY_STORAGE_KEY)

    if (!privateKey || !publicKey) {
      privateKey = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY)
      publicKey = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY)
      if (privateKey && publicKey) {
        sessionStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privateKey)
        sessionStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKey)
      }
    }

    if (!privateKey || !publicKey) return null
    return { privateKey, publicKey }
  } catch {
    return null
  }
}

export function clearSessionKeys(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(PRIVATE_KEY_STORAGE_KEY)
    sessionStorage.removeItem(PUBLIC_KEY_STORAGE_KEY)
    localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY)
    localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY)
  } catch {}
}
