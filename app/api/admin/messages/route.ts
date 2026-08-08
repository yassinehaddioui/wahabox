import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { checkIpRate } from '@/lib/rate-limit'
import { success, error } from '@/lib/response'
import { RateLimitError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { type Prisma } from '@prisma/client'

const WINDOW = { windowMs: 60_000, max: 30 }
const VALID_TYPES = ['', 'secure', 'box']
const VALID_STATUSES = ['', 'pending', 'read', 'destroyed']

// ── Normalized entry shape ──────────────────────────────────────────

type MessageEntry = {
  id: string
  type: 'secure' | 'box'
  senderUsername: string | null
  targetLabel: string | null
  status: 'pending' | 'read' | 'destroyed'
  createdAt: string
  readAt: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────

function buildSecureWhere(status: string): Prisma.SecureMessageWhereInput {
  switch (status) {
    case 'pending':
      return { readAt: null, isDestroyed: false }
    case 'read':
      return { readAt: { not: null } }
    case 'destroyed':
      return { isDestroyed: true }
    default:
      return {}
  }
}

function buildBoxWhere(status: string): Prisma.MessageWhereInput {
  switch (status) {
    case 'pending':
      return { readAt: null }
    case 'read':
      return { readAt: { not: null } }
    case 'destroyed':
      // Box messages have no destroyed state — impossible where yields []
      return { id: 'none' }
    default:
      return {}
  }
}

// ── Route handler ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // Guard: rate limit
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    if (await checkIpRate(`admin-messages:${ip}`, WINDOW)) {
      throw new RateLimitError('Too many requests')
    }
    await getAdminUser(request)

    // Parse query params
    const { searchParams } = request.nextUrl
    const rawType = searchParams.get('type') ?? ''
    const rawStatus = searchParams.get('status') ?? ''
    const type = VALID_TYPES.includes(rawType) ? rawType : ''
    const status = VALID_STATUSES.includes(rawStatus) ? rawStatus : ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))

    // Build where clauses per table
    const shouldQuerySecure = type === '' || type === 'secure'
    const shouldQueryBox = type === '' || type === 'box'

    const secureWhere = shouldQuerySecure ? buildSecureWhere(status) : { id: 'none' }
    const boxWhere = shouldQueryBox ? buildBoxWhere(status) : { id: 'none' }

    const take = page * limit

    // Fetch both tables + counts in parallel
    const [secureRows, secureCount, boxRows, boxCount] = await Promise.all([
      prisma.secureMessage.findMany({
        where: secureWhere,
        select: {
          id: true,
          senderId: true,
          sender: { select: { username: true } },
          createdAt: true,
          readAt: true,
          isDestroyed: true,
          autoDestruct: true,
          passwordHash: true,
          startDate: true,
          endDate: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.secureMessage.count({ where: secureWhere }),
      prisma.message.findMany({
        where: boxWhere,
        select: {
          id: true,
          poBoxId: true,
          poBox: { select: { label: true, slug: true } },
          createdAt: true,
          readAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.message.count({ where: boxWhere }),
    ])

    // Normalize & merge
    const entries: MessageEntry[] = []

    for (const row of secureRows) {
      let rowStatus: MessageEntry['status']
      if (row.isDestroyed) {
        rowStatus = 'destroyed'
      } else if (row.readAt) {
        rowStatus = 'read'
      } else {
        rowStatus = 'pending'
      }

      entries.push({
        id: row.id,
        type: 'secure',
        senderUsername: row.sender?.username ?? null,
        targetLabel: null,
        status: rowStatus,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
      })
    }

    for (const row of boxRows) {
      const rowStatus: 'pending' | 'read' = row.readAt ? 'read' : 'pending'

      entries.push({
        id: row.id,
        type: 'box',
        senderUsername: null,
        targetLabel: row.poBox.label,
        status: rowStatus,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
      })
    }

    // Sort by createdAt desc then slice for current page
    entries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const paged = entries.slice((page - 1) * limit, page * limit)

    const total = secureCount + boxCount
    const totalPages = total === 0 ? 1 : Math.ceil(total / limit)

    return success({
      entries: paged,
      total,
      page,
      limit,
      totalPages,
    })
  } catch (err) {
    return error(err)
  }
}
