'use client'

import { SecureMessageForm } from '@/components/secure-message-form'
import { SentMessagesList } from '@/components/sent-messages-list'

export default function SendPage() {
  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Send Encrypted Message</h1>
        <p className="text-sm text-muted-foreground">
          Compose an encrypted message. A secret link will be generated for the recipient.
        </p>
      </div>
      <SecureMessageForm />
      <SentMessagesList />
    </div>
  )
}
