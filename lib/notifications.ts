import { decryptEmail } from './email-crypto'
import { sendNewMessageNotification, sendRecoveryKeyRegeneratedNotification, checkNotificationRateLimit } from './email'
import prisma from './prisma'

export async function notifyNewMessage(poBoxId: string): Promise<void> {
  const box = await prisma.poBox.findUnique({
    where: { id: poBoxId },
    select: {
      label: true,
      notify: true,
      owner: {
        select: {
          id: true,
          emailEncrypted: true,
          emailNonce: true,
          emailVerified: true,
          notificationsEnabled: true,
        },
      },
    },
  })

  if (!box || !box.notify || !box.owner.notificationsEnabled) return
  if (!box.owner.emailVerified || !box.owner.emailEncrypted || !box.owner.emailNonce) return

  const rateLimited = await checkNotificationRateLimit(box.owner.id)
  if (rateLimited) return

  try {
    const email = decryptEmail(
      new Uint8Array(box.owner.emailEncrypted),
      new Uint8Array(box.owner.emailNonce),
    )

    await sendNewMessageNotification(email, box.label)
  } catch {
    console.error('[notification] Failed to send')
  }
}

export async function notifyRecoveryRegenerated(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true, emailEncrypted: true, emailNonce: true, username: true },
    })

    if (!user?.emailVerified || !user?.emailEncrypted || !user?.emailNonce) return

    if (await checkNotificationRateLimit(userId)) return

    const email = decryptEmail(
      new Uint8Array(user.emailEncrypted),
      new Uint8Array(user.emailNonce),
    )

    await sendRecoveryKeyRegeneratedNotification(email, user.username, new Date())
  } catch (err) {
    console.error('[notifications] Failed to send recovery key notification:', err)
  }
}
