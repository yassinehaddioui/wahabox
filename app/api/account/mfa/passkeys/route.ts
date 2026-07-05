import { NextRequest } from 'next/server'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError } from '@/lib/errors'
import { generateRegOptions, verifyRegResponse } from '@/lib/webauthn'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/admin-audit'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const credentials = await prisma.passkeyCredential.findMany({
      where: { userId: user.id },
      select: { id: true, deviceName: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    })

    return success(credentials)
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const body = (await request.json()) as {
      action?: string
      attestation?: RegistrationResponseJSON
      deviceName?: string
    }

    if (!body.action || body.action === 'setup') {
      const existing = await prisma.passkeyCredential.findMany({
        where: { userId: user.id },
        select: { credentialId: true },
      })

      const options = await generateRegOptions(user.id, user.username, existing)
      return success(options)
    }

    if (body.action === 'confirm') {
      if (!body.attestation) throw new BadRequestError('Attestation is required')

      const result = await verifyRegResponse(user.id, body.attestation)

      const deviceName = body.deviceName ?? 'Unknown device'

      await prisma.passkeyCredential.create({
        data: {
          userId: user.id,
          credentialId: new Uint8Array(result.credentialId),
          publicKey: new Uint8Array(result.publicKey),
          counter: result.counter,
          transports: result.transports ?? null,
          deviceName,
        },
      })

      await prisma.user.update({
        where: { id: user.id },
        data: { mfaPasskey: true },
      })

      // Fire-and-forget audit log
      writeAuditLog({
        actorId: user.id,
        actorUsername: user.username,
        action: 'mfa.passkey_register',
        targetType: 'user',
        targetId: user.id,
        metadata: { deviceName },
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      })

      return success({ registered: true, deviceName })
    }

    throw new BadRequestError('Invalid action')
  } catch (err) {
    return error(err)
  }
}
