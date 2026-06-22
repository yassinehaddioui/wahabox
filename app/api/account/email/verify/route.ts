import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { BadRequestError } from '@/lib/errors'
import { getRedis } from '@/lib/redis'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { token } = (await request.json()) as { token?: string }
    if (!token || typeof token !== 'string') {
      throw new BadRequestError('Invalid verification link')
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const redis = await getRedis()
    const userId = await redis.get(`verify:${tokenHash}`)

    if (!userId) {
      throw new BadRequestError('Invalid or expired verification link')
    }

    await Promise.all([
      prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true },
      }),
      redis.del(`verify:${tokenHash}`),
    ])

    return success({ message: 'Email verified' })
  } catch (err) {
    return error(err)
  }
}
