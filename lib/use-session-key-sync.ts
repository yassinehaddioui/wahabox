'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  PRIVATE_KEY_STORAGE_KEY,
  PUBLIC_KEY_STORAGE_KEY,
  PRIVATE_KEY_SIGN_STORAGE_KEY,
  PUBLIC_KEY_SIGN_STORAGE_KEY,
  clearSessionKeys,
} from '@/lib/session-keys'

export function useSessionKeySync() {
  const router = useRouter()

  useEffect(() => {
    try {
      const sessionPriv = sessionStorage.getItem(PRIVATE_KEY_STORAGE_KEY)
      const sessionPub = sessionStorage.getItem(PUBLIC_KEY_STORAGE_KEY)
      const localPriv = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY)
      const localPub = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY)

      if ((!sessionPriv || !sessionPub) && localPriv && localPub) {
        sessionStorage.setItem(PRIVATE_KEY_STORAGE_KEY, localPriv)
        sessionStorage.setItem(PUBLIC_KEY_STORAGE_KEY, localPub)
      }

      const sessionPrivSign = sessionStorage.getItem(PRIVATE_KEY_SIGN_STORAGE_KEY)
      const sessionPubSign = sessionStorage.getItem(PUBLIC_KEY_SIGN_STORAGE_KEY)
      const localPrivSign = localStorage.getItem(PRIVATE_KEY_SIGN_STORAGE_KEY)
      const localPubSign = localStorage.getItem(PUBLIC_KEY_SIGN_STORAGE_KEY)

      if ((!sessionPrivSign || !sessionPubSign) && localPrivSign && localPubSign) {
        sessionStorage.setItem(PRIVATE_KEY_SIGN_STORAGE_KEY, localPrivSign)
        sessionStorage.setItem(PUBLIC_KEY_SIGN_STORAGE_KEY, localPubSign)
      }
    } catch {}

    function onStorage(event: StorageEvent) {
      if (
        (event.key === PRIVATE_KEY_STORAGE_KEY || event.key === PUBLIC_KEY_STORAGE_KEY ||
         event.key === PRIVATE_KEY_SIGN_STORAGE_KEY || event.key === PUBLIC_KEY_SIGN_STORAGE_KEY) &&
        event.newValue === null
      ) {
        clearSessionKeys()
        router.replace('/login')
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [router])
}
