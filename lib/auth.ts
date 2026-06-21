import { NextRequest } from 'next/server'
import { UnauthorizedError } from './errors'

export type AuthUser = {
  id: string
  username: string
}

/**
 * Extracts the authenticated user from the request.
 * TODO: Implement real session/cookie validation (Phase 4).
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser> {
  const sessionToken = request.cookies.get('session')?.value

  if (!sessionToken) {
    throw new UnauthorizedError('No session token')
  }

  // TODO: Validate session token against database/redis
  // This is a placeholder — replace with real session lookup in Phase 4
  throw new UnauthorizedError('Invalid session')
}
