import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, loginSchema } from '@/lib/validation'
import { UnauthorizedError } from '@/lib/errors'

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, loginSchema)

    // TODO: Look up user by username, compare authVerifier in constant time (Phase 4)
    // const user = await prisma.user.findUnique({ where: { username: body.username } })
    // if (!user) {
    //   // Anti-enumeration: use dummy timing path
    //   throw new UnauthorizedError('Invalid credentials')
    // }
    // const computed = sodium.crypto_generichash(32, ...)
    // if (!sodium.memcmp(computed, user.authVerifier)) {
    //   throw new UnauthorizedError('Invalid credentials')
    // }

    throw new UnauthorizedError('Invalid credentials')
  } catch (err) {
    return error(err)
  }
}
