import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { getAuthUser } from '@/lib/auth'
import { checkIpRate, checkUserRate, checkGlobalRate } from '@/lib/rate-limit'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { success, error } from '@/lib/response'
import { BadRequestError, RateLimitError, ApiError } from '@/lib/errors'
import prisma from '@/lib/prisma'

const PROMOTE_WINDOW = { windowMs: 900_000, max: 3 }

export async function POST(request: NextRequest) {
  try {
    // 1. Auth gate
    const user = await getAuthUser(request)

    // 2. Check if promotion is configured
    const adminToken = process.env.ADMIN_PROMOTE_TOKEN
    if (!adminToken) {
      throw new ApiError('Admin promotion is not configured', 501)
    }

    // 3. Rate limit
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    if (
      (await checkIpRate(`promote:${ip}`, PROMOTE_WINDOW)) ||
      (await checkUserRate(user.username, PROMOTE_WINDOW)) ||
      (await checkGlobalRate())
    ) {
      throw new RateLimitError('Too many promotion attempts. Try again later.')
    }

    // 4. Parse body
    const { token, csrfToken } = (await request.json()) as { token?: string; csrfToken?: string }
    if (!token || typeof token !== 'string') {
      throw new BadRequestError('Token is required')
    }
    if (!csrfToken || typeof csrfToken !== 'string') {
      throw new BadRequestError('CSRF token is required')
    }

    // 5. Verify CSRF
    const csrfValid = await verifyAndConsumeCsrfToken('admin-promote', csrfToken)
    if (!csrfValid) {
      throw new BadRequestError('Invalid CSRF token')
    }

    // 6. Constant-time token comparison
    const inputBuf = Buffer.from(token)
    const envBuf = Buffer.from(adminToken)
    if (inputBuf.length !== envBuf.length || !crypto.timingSafeEqual(inputBuf, envBuf)) {
      throw new BadRequestError('Invalid token')
    }

    // 7. Check if already admin
    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    })
    if (record?.role === 'admin') {
      return success({ message: 'Already an admin', alreadyAdmin: true })
    }

    // 8. Promote
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'admin' },
    })

    // 9. Audit log
    console.log('[admin] promote', {
      userId: user.id,
      username: user.username,
      ip,
      timestamp: new Date().toISOString(),
      action: 'self-promote',
    })

    // 10. Return success
    return success({ message: 'You are now an admin' })
  } catch (err) {
    return error(err)
  }
}
