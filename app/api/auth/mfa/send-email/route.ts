import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { parseBody, mfaSendEmailSchema } from '@/lib/validation'
import { BadRequestError, UnauthorizedError } from '@/lib/errors'
import { getRedis } from '@/lib/redis'
import { decryptEmail } from '@/lib/email-crypto'
import { sendMfaCodeEmail } from '@/lib/email'
import { generateMfaCode } from '@/lib/totp'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, mfaSendEmailSchema)

    const redis = await getRedis()
    const raw = await redis.get(`mfa:${body.mfaToken}`)
    if (!raw) throw new UnauthorizedError('MFA session expired')

    const session: {
      userId: string
      methods: string[]
      verified: string[]
      emailCodeHash: string | null
      emailSentAt: number | null
      emailAttempts: number
    } = JSON.parse(raw)

    if (!session.methods.includes('email')) {
      throw new BadRequestError('Email MFA is not enabled for this account')
    }

    const now = Date.now()
    if (session.emailSentAt && now - session.emailSentAt < 60_000) {
      throw new BadRequestError('Please wait 60 seconds before requesting a new code')
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { emailEncrypted: true, emailNonce: true, username: true },
    })

    if (!user?.emailEncrypted || !user?.emailNonce) {
      throw new BadRequestError('No verified email on file')
    }

    const email = decryptEmail(
      new Uint8Array(user.emailEncrypted),
      new Uint8Array(user.emailNonce),
    )

    const code = generateMfaCode()
    const codeHash = crypto.createHash('sha256').update(code).digest('hex')

    session.emailCodeHash = codeHash
    session.emailSentAt = now
    await redis.set(`mfa:${body.mfaToken}`, JSON.stringify(session), 'EX', 300)

    try {
      await sendMfaCodeEmail(email, user.username, code)
    } catch (err) {
      if (process.env.APP_MODE === 'development') {
        console.log(`[mfa] [dev] Email send skipped, code ${code} is still valid for verification`)
        console.error('[mfa] Failed to send email code:', err)
      } else {
        await redis.set(`mfa:${body.mfaToken}`, JSON.stringify({
          ...session,
          emailCodeHash: null,
          emailSentAt: null,
        }), 'EX', 300)
        throw new Error('Failed to send verification email')
      }
    }

    return success({ sent: true })
  } catch (err) {
    return error(err)
  }
}
