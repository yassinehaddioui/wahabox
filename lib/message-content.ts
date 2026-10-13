export type MessageContent = {
  subject: string
  body: string
}

type MessageEnvelope = {
  format: 'wahabox-message-v1'
  subject: string
  body: string
}

/** Keep older plain-text messages readable while storing new subjects with the body. */
export function encodeMessageContent(subject: string, body: string): string {
  const trimmedSubject = subject.trim()
  if (!trimmedSubject) return body

  const envelope: MessageEnvelope = {
    format: 'wahabox-message-v1',
    subject: trimmedSubject,
    body,
  }
  return JSON.stringify(envelope)
}

export function decodeMessageContent(plaintext: string): MessageContent {
  try {
    const parsed: unknown = JSON.parse(plaintext)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'format' in parsed &&
      parsed.format === 'wahabox-message-v1' &&
      'subject' in parsed &&
      typeof parsed.subject === 'string' &&
      'body' in parsed &&
      typeof parsed.body === 'string'
    ) {
      return { subject: parsed.subject, body: parsed.body }
    }
  } catch {
    // Existing messages are stored as plain text.
  }

  return { subject: '', body: plaintext }
}
