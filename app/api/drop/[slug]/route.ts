import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, submitMessageSchema } from '@/lib/validation'
import { BadRequestError, NotFoundError, RateLimitError, InvalidPasswordError } from '@/lib/errors'
import { notifyNewMessage } from '@/lib/notifications'
import { checkDropRateLimit, getDropIpCounts, recordDropIp } from '@/lib/rate-limit'
import { verifyPow, consumeChallenge } from '@/lib/pow'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { checkTurnstile, TURNSTILE_PROOF_COOKIE } from '@/lib/turnstile'
import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'

const MAX_CIPHERTEXT_SIZE = 100 * 1024
const HOURLY_QUOTA = 20
const DAILY_QUOTA = 100
const IP_HOURLY_QUOTA = 30
const IP_DAILY_QUOTA = 200

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    const box = await prisma.poBox.findUnique({
      where: { slug },
      select: {
        label: true,
        greeting: true,
        isActive: true,
        expiresAt: true,
        maxMessages: true,
        passwordHash: true,
        owner: { select: { publicKey: true } },
        _count: { select: { messages: true } },
      },
    })

    if (
      !box ||
      !box.isActive ||
      (box.expiresAt && box.expiresAt < new Date()) ||
      (box.maxMessages !== null && box._count.messages >= box.maxMessages)
    ) {
      throw new NotFoundError('Not found')
    }

    return success({
      label: box.label,
      greeting: box.greeting,
      publicKey: Buffer.from(box.owner.publicKey).toString('base64'),
      hasPassword: !!box.passwordHash,
    })
  } catch (err) {
    return error(err)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  let proofToken: string | null = null
  try {
    const { slug } = await params

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'

    if (await checkDropRateLimit(slug, ip)) {
      throw new RateLimitError('Too many submissions. Try again later.')
    }

    const ipCounts = await getDropIpCounts(ip)
    if (ipCounts.hourly >= IP_HOURLY_QUOTA) {
      throw new RateLimitError('Too many submissions from this IP. Try again later.')
    }
    if (ipCounts.daily >= IP_DAILY_QUOTA) {
      throw new RateLimitError('Too many submissions from this IP. Try again tomorrow.')
    }

    const body = await parseBody(request, submitMessageSchema)

    const box = await prisma.poBox.findUnique({
      where: { slug },
      select: {
        id: true,
        isActive: true,
        expiresAt: true,
        maxMessages: true,
        passwordHash: true,
        _count: { select: { messages: true } },
      },
    })

    if (
      !box ||
      !box.isActive ||
      (box.expiresAt && box.expiresAt < new Date()) ||
      (box.maxMessages !== null && box._count.messages >= box.maxMessages)
    ) {
      throw new NotFoundError('Not found')
    }

    if (box.passwordHash) {
      if (!body.password) {
        throw new InvalidPasswordError('Password required')
      }
      const valid = await bcrypt.compare(body.password, box.passwordHash)
      if (!valid) {
        throw new InvalidPasswordError('Invalid password')
      }
    }

    const csrfValid = await verifyAndConsumeCsrfToken(slug, body.csrfToken ?? null)
    if (!csrfValid) {
      throw new BadRequestError('Invalid or expired CSRF token')
    }

    const turnstileResult = await checkTurnstile(
      request.cookies.get(TURNSTILE_PROOF_COOKIE)?.value,
      body.turnstileToken ?? null,
      ip,
    )
    if (!turnstileResult.verified) {
      throw new BadRequestError('CAPTCHA verification failed')
    }
    proofToken = turnstileResult.setProofCookie

    if (body.challenge && body.nonce) {
      const valid = verifyPow(body.challenge, body.nonce)
      const consumed = await consumeChallenge(body.challenge)
      if (!valid || !consumed) {
        throw new BadRequestError('Invalid proof of work')
      }
    }

    const now = new Date()
    const hourAgo = new Date(now.getTime() - 3600_000)
    const todayStart = new Date(now)
    todayStart.setUTCHours(0, 0, 0, 0)

    const [hourlyCount, dailyCount] = await Promise.all([
      prisma.message.count({
        where: {
          poBoxId: box.id,
          createdAt: { gte: hourAgo },
        },
      }),
      prisma.message.count({
        where: {
          poBoxId: box.id,
          createdAt: { gte: todayStart },
        },
      }),
    ])

    if (hourlyCount >= HOURLY_QUOTA) {
      throw new RateLimitError('This box has reached its hourly message limit')
    }
    if (dailyCount >= DAILY_QUOTA) {
      throw new RateLimitError('This box has reached its daily message limit')
    }

    const ciphertext = Buffer.from(body.ciphertext, 'base64')
    if (ciphertext.length > MAX_CIPHERTEXT_SIZE) {
      throw new BadRequestError('Message too large')
    }

    await prisma.message.create({
      data: {
        poBoxId: box.id,
        ciphertext,
      },
    })

    recordDropIp(ip).catch(() => {})
    notifyNewMessage(box.id).catch(() => {})

    const res = success({ message: 'Message sent' }, 201)
    if (proofToken) {
      res.cookies.set(TURNSTILE_PROOF_COOKIE, proofToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 2592000,
      })
    }
    return res
  } catch (err) {
    const res = error(err)
    if (proofToken) {
      res.cookies.set(TURNSTILE_PROOF_COOKIE, proofToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 2592000,
      })
    }
    return res
  }
}
