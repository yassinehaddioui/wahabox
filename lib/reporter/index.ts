import { buildEnvelope } from './envelope'
import { shouldReport } from './dedup'
import { logger } from '@/lib/logger'
import { ApiError } from '@/lib/errors'
import type { ErrorEnvelope, ErrorNotifier } from '@/lib/notifiers/types'

export { buildEnvelope } from './envelope'
export { sanitizeString } from './sanitize'

// ── module-scope state ─────────────────────────────────────────────────────

let reporting = false
const notifiers: ErrorNotifier[] = []
let defaultNotifiersSeeded = false

// ── lazy default notifier seeding ──────────────────────────────────────────

/**
 * Seed default notifiers on first use.
 *
 * Dynamically imports `lib/notifiers/discord.ts` (Todo 6) so that once that
 * module ships, the Discord notifier auto-registers with zero code change in
 * this file.  Until then the import is caught silently and the reporter works
 * standalone.
 */
function ensureDefaultNotifiers(): void {
  if (defaultNotifiersSeeded) return
  defaultNotifiersSeeded = true

  // Lazy import — dynamically loaded; fails silently when absent (pre-Todo 6).
  void import('@/lib/notifiers/discord')
    .then((m: { DiscordNotifier: new () => ErrorNotifier }) => {
      notifiers.push(new m.DiscordNotifier())
    })
    .catch(() => {
      // Not shipped yet; skip.  When Todo 6 lands, this dynamic import
      // resolves and the Discord sink auto-registers on first reportError call.
    })
}

// ── public API ─────────────────────────────────────────────────────────────

/** Register a custom notifier (e.g. a Sentry or test mock sink). */
export function registerNotifier(n: ErrorNotifier): void {
  notifiers.push(n)
}

/**
 * Report an error through all registered notifiers.
 *
 * Guards:
 * - **4xx ApiError skip** — intentional client errors (400-499) are not
 *   reported; they're expected and would be noisy.
 * - **Recursion guard** — re-entrant calls (e.g. a notifier that throws
 *   inside an uncaughtException handler) return immediately.
 * - **Dedup + burst** — delegated to {@link shouldReport}.
 * - **Catch-all** — internal failures are logged and swallowed; this function
 *   never rejects and always returns `void`.
 *
 * @param err   The thrown value — any `unknown`.
 * @param ctx   Optional envelope field overrides.
 */
export async function reportError(
  err: unknown,
  ctx?: Partial<ErrorEnvelope>,
): Promise<void> {
  // Recursion guard
  if (reporting) return
  reporting = true

  try {
    // 4xx ApiError guard — intentional/expected, do not report
    if (err instanceof ApiError && err.statusCode < 500) return

    ensureDefaultNotifiers()

    const envelope = buildEnvelope(err, ctx)

    const doReport = await shouldReport(envelope)
    if (!doReport) return

    // Dispatch to all notifiers in parallel.  A single notifier failure
    // must not prevent others from running.
    await Promise.all(
      notifiers.map((n) =>
        n.notify(envelope).catch((reason: unknown) => {
          logger.error('[notifier] failed', { reason })
        }),
      ),
    )
  } catch (reason) {
    logger.error('[reporter] internal failure', { reason })
  } finally {
    reporting = false
  }
}
