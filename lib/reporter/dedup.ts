import { checkDedup, checkIpRate } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import type { ErrorEnvelope } from '@/lib/notifiers/types'

/**
 * Decide whether an error envelope should be dispatched.
 *
 * Two-layer gating:
 * 1. Per-signature dedup (5 min TTL) — one alert per unique error signature.
 *    For client errors the dedup key also includes the IP so each user gets
 *    their own first-alert window.
 * 2. Global burst cap (30 per minute) — hard limit to protect the Discord
 *    webhook and avoid flooding in runaway scenarios.
 *
 * On Redis failure we fall back to "report anyway" — better noisy than silent.
 * This function never throws.
 */
export async function shouldReport(envelope: ErrorEnvelope): Promise<boolean> {
  try {
    // Layer 1 — signature dedup
    let dedupKey: string
    if (envelope.source === 'client') {
      dedupKey = `client:${envelope.signature}:${envelope.ip ?? 'unknown'}`
    } else {
      dedupKey = `${envelope.source}:${envelope.signature}`
    }

    const firstOccurrence = await checkDedup(dedupKey, 300)
    if (!firstOccurrence) {
      return false
    }

    // Layer 2 — global burst cap
    const burstLimited = await checkIpRate('reporter:burst', {
      windowMs: 60_000,
      max: 30,
    })
    if (burstLimited) {
      return false
    }

    return true
  } catch (reason) {
    // Swallow — better noisy than silent
    logger.error('[dedup] failed', { reason })
    return true
  }
}
