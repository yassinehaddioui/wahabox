/**
 * Discord webhook transport for the error reporter (Todo 6).
 *
 * Auto-disables when DISCORD_WEBHOOK_URL is unset so the reporter works
 * safely in development / CI.  The reporter's lazy seeder at
 * lib/reporter/index.ts::ensureDefaultNotifiers dynamically imports this
 * module and instantiates DiscordNotifier — there is NO module-scope
 * registerNotifier call here (the reporter pushes the instance itself).
 */

import type { ErrorEnvelope, ErrorNotifier } from './types'
import { logger } from '@/lib/logger'

// ── types ──────────────────────────────────────────────────────────────────

interface DiscordField {
  name: string
  value: string
  inline: boolean
}

interface DiscordEmbed {
  title: string
  color: number
  fields: DiscordField[]
  footer: { text: string }
  timestamp: string
  description?: string
}

// ── notifier ───────────────────────────────────────────────────────────────

export class DiscordNotifier implements ErrorNotifier {
  private readonly webhookUrl: string | undefined

  constructor() {
    this.webhookUrl = process.env.DISCORD_WEBHOOK_URL || undefined
  }

  async notify(payload: ErrorEnvelope): Promise<void> {
    if (!this.webhookUrl) return

    const embed = buildEmbed(payload)

    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
        signal: AbortSignal.timeout(3000),
      })

      if (!res.ok) {
        logger.error('[discord] non-2xx', { status: res.status })
      }
    } catch (e: unknown) {
      logger.error('[discord] notify failed', { reason: String(e) })
    }
  }
}

// ── embed builder (pure) ───────────────────────────────────────────────────

const COLOR_ERROR = 0xed4245
const COLOR_WARN = 0xfaa61a
const COLOR_INFO = 0x95a5a6

function buildEmbed(payload: ErrorEnvelope): DiscordEmbed {
  const envName = payload.env ?? process.env.NODE_ENV ?? 'development'
  const route = payload.route ?? 'unknown'

  const color =
    payload.level === 'error'
      ? COLOR_ERROR
      : payload.level === 'warn'
        ? COLOR_WARN
        : COLOR_INFO

  const fields: DiscordField[] = [
    { name: 'level', value: payload.level, inline: true },
    { name: 'signature', value: payload.signature, inline: true },
    { name: 'source', value: payload.source, inline: true },
  ]

  if (payload.requestId) {
    fields.push({ name: 'requestId', value: payload.requestId, inline: true })
  }
  if (payload.ip) {
    fields.push({ name: 'ip', value: payload.ip, inline: true })
  }
  if (payload.sha) {
    fields.push({ name: 'sha', value: payload.sha, inline: true })
  }

  let description: string | undefined
  if (payload.stackFirstFrame && payload.stackFirstFrame.length > 0) {
    const lines = payload.stackFirstFrame.split('\n').slice(0, 5)
    description = lines.join('\n')
    if (description.length > 1500) {
      description = description.slice(0, 1500) + '\u2026'
    }
  }

  return {
    title: `[${envName}] ${payload.code} on ${route}`,
    color,
    fields,
    footer: { text: payload.sha ?? 'unknown' },
    timestamp: payload.ts,
    ...(description !== undefined ? { description } : {}),
  }
}
