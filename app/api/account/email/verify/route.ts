import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json() as { token?: string }
    if (!token || typeof token !== 'string') {
      return success({ message: 'Invalid token' })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    // TODO: Look up verification token in database/redis
    // Compare tokenHash in constant time, mark email as verified

    return success({ message: 'Email verified' })
  } catch (err) {
    return error(err)
  }
}
