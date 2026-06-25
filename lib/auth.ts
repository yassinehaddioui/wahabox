import { NextRequest } from 'next/server'
import { UnauthorizedError } from './errors'
import { validateSession } from './session'

export type AuthUser = {
  id: string
  username: string
  role: string
}

export async function getAuthUser(request: NextRequest): Promise<AuthUser> {
  const sessionToken = request.cookies.get('session')?.value
  if (!sessionToken) {
    throw new UnauthorizedError('No session token')
  }

  const session = await validateSession(sessionToken)
  if (!session) {
    throw new UnauthorizedError('Invalid or expired session')
  }

  return { id: session.userId, username: session.username, role: session.role }
}
