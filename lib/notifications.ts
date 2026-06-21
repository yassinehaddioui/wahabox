import { decryptEmail } from './email-crypto'
import prisma from './prisma'

/**
 * Notify a PO Box owner about a new message.
 * Called after a message is stored.
 */
export async function notifyNewMessage(poBoxId: string): Promise<void> {
  const box = await prisma.poBox.findUnique({
    where: { id: poBoxId },
    select: {
      label: true,
      notify: true,
      owner: {
        select: {
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

  try {
    const email = decryptEmail(
      new Uint8Array(box.owner.emailEncrypted),
      new Uint8Array(box.owner.emailNonce),
    )

    // TODO: Send actual email notification
    // Body: "You have a new message in your PO Box '{label}'."
    // Rate-limit per account (max 1 notification per X minutes)

    console.log(`[notification] Would notify ${email} about new message in "${box.label}"`)
  } catch {
    // Email decryption failure — log opaque error without the address
    console.error('[notification] Failed to decrypt email for notification')
  }
}
