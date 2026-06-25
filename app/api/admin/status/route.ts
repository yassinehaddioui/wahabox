import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { checkIpRate } from '@/lib/rate-limit'
import { success, error } from '@/lib/response'

const STATUS_WINDOW = { windowMs: 60_000, max: 100 }

export async function GET(request: NextRequest) {
  try {
    // Light rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
               request.headers.get('x-real-ip') ??
               'unknown'
    if (await checkIpRate(`admin-status:${ip}`, STATUS_WINDOW)) {
      return success({ isAdmin: false }) // Don't leak rate limit info
    }

    const user = await getAuthUser(request)
    return success({ isAdmin: user.role === 'admin' })
  } catch (err) {
    return error(err)
  }
}
