import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { withRedis } from './redis'
import ENV from './env'

let sesClient: SESv2Client | null = null

function getSes(): SESv2Client {
  if (!sesClient) {
    sesClient = new SESv2Client({
      region: process.env.AWS_REGION ?? 'us-east-1',
    })
  }
  return sesClient
}

function getFromAddress(): string {
  const addr = process.env.SES_FROM_ADDRESS
  if (!addr) throw new Error('SES_FROM_ADDRESS is not set')
  return addr
}

export async function sendVerificationEmail(
  to: string,
  username: string,
  token: string,
): Promise<void> {
  const link = `${ENV.APP_URL}/verify-email?token=${token}`

  if (process.env.APP_MODE === 'development') {
    console.log('[email] Verification link:', link)
  }

  const client = getSes()

  await client.send(
    new SendEmailCommand({
      FromEmailAddress: getFromAddress(),
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: 'Verify your email for Wahabox' },
          Body: {
            Text: {
              Data: [
                `Hello ${username},`,
                '',
                'Please verify your email address for Wahabox by clicking the link below:',
                '',
                link,
                '',
                'This link expires in 60 minutes.',
                '',
                'If you did not request this, you can safely ignore this email.',
              ].join('\n'),
            },
          },
        },
      },
    }),
  )
}

export async function sendNewMessageNotification(to: string, boxLabel: string): Promise<void> {
  const loginLink = `${ENV.APP_URL}/login`
  const client = getSes()

  await client.send(
    new SendEmailCommand({
      FromEmailAddress: getFromAddress(),
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: 'New message in your PO Box' },
          Body: {
            Text: {
              Data: [
                `You have a new message in your PO Box "${boxLabel}".`,
                '',
                'Sign in to read it:',
                loginLink,
              ].join('\n'),
            },
          },
        },
      },
    }),
  )
}

export async function checkNotificationRateLimit(userId: string): Promise<boolean> {
  return withRedis(async (redis) => {
    const key = `notif:${userId}`
    const lastSent = await redis.get(key)
    if (lastSent) return true

    await redis.set(key, Date.now().toString(), 'EX', 300)
    return false
  }, false)
}

export async function sendMfaCodeEmail(to: string, username: string, code: string): Promise<void> {
  if (process.env.APP_MODE === 'development') {
    console.log(`[email] MFA code for ${to}: ${code}`)
  }

  const client = getSes()

  await client.send(
    new SendEmailCommand({
      FromEmailAddress: getFromAddress(),
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: 'Your Wahabox verification code' },
          Body: {
            Text: {
              Data: [
                `Hello ${username},`,
                '',
                `Your verification code is: ${code}`,
                '',
                'This code expires in 5 minutes.',
                '',
                'If you did not attempt to sign in, your password may be compromised. Change it immediately.',
              ].join('\n'),
            },
          },
        },
      },
    }),
  )
}

export async function sendRecoveryKeyRegeneratedNotification(
  to: string,
  username: string,
  timestamp: Date,
): Promise<void> {
  const loginLink = `${ENV.APP_URL}/login`
  const formattedTimestamp = timestamp.toLocaleString()

  if (process.env.APP_MODE === 'development') {
    console.log(`[email] Recovery key regenerated notification sent to ${to}`)
  }

  const client = getSes()

  await client.send(
    new SendEmailCommand({
      FromEmailAddress: getFromAddress(),
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: 'Your Wahabox recovery key was changed' },
          Body: {
            Text: {
              Data: [
                `Hello ${username},`,
                '',
                `A new recovery key was generated for your account at ${formattedTimestamp}.`,
                'If you did not make this change, sign in immediately and secure your account.',
                '',
                loginLink,
              ].join('\n'),
            },
          },
        },
      },
    }),
  )
}
