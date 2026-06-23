'use client'

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

interface TurnstileWidgetProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

export function TurnstileWidget({ siteKey, onVerify, onExpire, onError }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const onVerifyRef = useRef(onVerify)
  const onExpireRef = useRef(onExpire)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onVerifyRef.current = onVerify
    onExpireRef.current = onExpire
    onErrorRef.current = onError
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function renderWidget() {
      if (!window.turnstile || !container) return
      if (widgetId.current) {
        window.turnstile.reset(widgetId.current)
        return
      }
      widgetId.current = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: (token: string) => onVerifyRef.current(token),
        'expired-callback': () => onExpireRef.current?.(),
        'error-callback': () => onErrorRef.current?.(),
      })
    }

    const existingScript = document.querySelector('script[src*="turnstile"]')
    if (existingScript) {
      if (window.turnstile) {
        renderWidget()
      } else {
        const orig = window.onTurnstileLoad
        window.onTurnstileLoad = () => {
          orig?.()
          renderWidget()
        }
      }
      return
    }

    window.onTurnstileLoad = renderWidget

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    document.head.appendChild(script)

    return () => {
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current)
        widgetId.current = null
      }
      delete window.onTurnstileLoad
    }
  }, [siteKey])

  return <div ref={containerRef} className="flex justify-center" />
}
