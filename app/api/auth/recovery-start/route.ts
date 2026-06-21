import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, recoveryStartSchema } from '@/lib/validation'
import { NotFoundError } from '@/lib/errors'

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, recoveryStartSchema)

    // TODO: Look up user by username, return recovery data (Phase 5)
    // const user = await prisma.user.findUnique({ where: { username: body.username } })
    // if (!user) {
    //   // Anti-enumeration: return dummy data with identical timing
    //   throw new NotFoundError('User not found')
    // }

    throw new NotFoundError('User not found')
  } catch (err) {
    return error(err)
  }
}
