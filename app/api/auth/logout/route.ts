import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { clearSessionCookie } from '@/lib/session'

export async function POST(_request: NextRequest) {
  try {
    await clearSessionCookie()
    return success({ message: 'Logged out' })
  } catch (err) {
    return error(err)
  }
}
