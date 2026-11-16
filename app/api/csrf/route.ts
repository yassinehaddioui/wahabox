import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { generateCsrfToken, isCsrfIssuanceRateLimited, storeCsrfToken } from '@/lib/csrf'
import { getClientIp } from '@/lib/client-ip'
import { RateLimitError } from '@/lib/errors'
import prisma from '@/lib/prisma'

const ALLOWED_TAGS = new Set([
  'signup', 'login', 'recovery-start', 'recovery-complete', 'password-change',
  'admin-promote', 'admin-user-action', 'admin-box-action', 'admin-box-delete',
  'create-box', 'edit-box', 'delete-box', 'email-set', 'email-resend',
  'email-delete', 'email-notifications', 'regen-recovery', 'create-vault',
  'edit-vault', 'delete-vault', 'create-vault-item', 'edit-vault-item',
  'delete-vault-item', 'create-secure-message',
])

const BOX_SLUG = /^[a-zA-Z0-9_-]{1,64}$/

async function isAllowedTag(tag: string): Promise<boolean> {
  if (ALLOWED_TAGS.has(tag)) return true
  if (!BOX_SLUG.test(tag)) return false

  const box = await prisma.poBox.findUnique({
    where: { slug: tag },
    select: { id: true },
  })
  return box !== null
}

export async function GET(request: NextRequest) {
  try {
    const tag = request.nextUrl.searchParams.get('tag')

    if (!tag) {
      return success({ csrfToken: null })
    }

    const ip = getClientIp(request.headers)
    if (await isCsrfIssuanceRateLimited(ip)) {
      throw new RateLimitError('Too many CSRF token requests')
    }

    if (!(await isAllowedTag(tag))) {
      return success({ csrfToken: null })
    }

    const token = generateCsrfToken(tag)
    await storeCsrfToken(token).catch(() => {})

    return success({ csrfToken: token })
  } catch (err) {
    return error(err)
  }
}
