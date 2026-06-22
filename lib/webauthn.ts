import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  WebAuthnCredential,
} from '@simplewebauthn/server'
import { getRedis } from './redis'
import ENV from './env'

const RP_ID = new URL(ENV.APP_URL).hostname
const RP_NAME = 'Wahabox'
const CHALLENGE_TTL = 120

function getRpId(): string {
  return RP_ID
}

export interface PasskeyPublicKey {
  credentialId: Uint8Array
  publicKey: Uint8Array
  counter: number
  transports?: string
}

export async function generateRegOptions(
  userId: string,
  username: string,
  existingCredentials: { credentialId: Uint8Array; transports?: string[] }[],
) {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: getRpId(),
    userName: username,
    userDisplayName: username,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((c) => ({
      id: Buffer.from(c.credentialId).toString('base64url'),
      transports: (c.transports as AuthenticatorTransport[]) ?? undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  })

  const redis = await getRedis()
  await redis.set(`passkey:challenge:${userId}`, options.challenge, 'EX', CHALLENGE_TTL)

  return options
}

export async function verifyRegResponse(
  userId: string,
  response: RegistrationResponseJSON,
): Promise<{
  credentialId: Uint8Array
  publicKey: Uint8Array
  counter: number
  transports?: string
}> {
  const redis = await getRedis()
  const challenge = await redis.get(`passkey:challenge:${userId}`)
  if (!challenge) throw new Error('Challenge expired')

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: ENV.APP_URL,
    expectedRPID: getRpId(),
  })

  await redis.del(`passkey:challenge:${userId}`)

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey verification failed')
  }

  const info = verification.registrationInfo
  return {
    credentialId: new Uint8Array(Buffer.from(info.credential.id, 'base64url')),
    publicKey: new Uint8Array(info.credential.publicKey),
    counter: info.credential.counter,
    transports: (info.credential.transports as string[])?.join(','),
  }
}

export async function generateAuthOptions(
  userId: string,
  credentials: { credentialId: Uint8Array }[],
) {
  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    allowCredentials: credentials.map((c) => ({
      id: Buffer.from(c.credentialId).toString('base64url'),
      type: 'public-key' as const,
    })),
    userVerification: 'preferred',
  })

  const redis = await getRedis()
  await redis.set(`passkey:challenge:${userId}`, options.challenge, 'EX', CHALLENGE_TTL)

  return options
}

export async function verifyAuthResponse(
  userId: string,
  credential: { credentialId: Uint8Array; publicKey: Uint8Array; counter: number },
  response: AuthenticationResponseJSON,
): Promise<{ verified: boolean; newCounter: number }> {
  const redis = await getRedis()
  const challenge = await redis.get(`passkey:challenge:${userId}`)
  if (!challenge) throw new Error('Challenge expired')

  const cred: WebAuthnCredential = {
    id: Buffer.from(credential.credentialId).toString('base64url'),
    publicKey: new Uint8Array(credential.publicKey),
    counter: credential.counter,
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: ENV.APP_URL,
    expectedRPID: getRpId(),
    credential: cred,
  })

  await redis.del(`passkey:challenge:${userId}`)

  return {
    verified: verification.verified,
    newCounter: verification.verified
      ? verification.authenticationInfo.newCounter
      : credential.counter,
  }
}

export { getRpId }
