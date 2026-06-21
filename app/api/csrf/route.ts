import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { generateCsrfToken, storeCsrfToken } from '@/lib/csrf'

const ALLOWED_TAGS = ['signup', 'login', 'recovery-start', 'recovery-complete', 'password-change']

export async function GET(request: NextRequest) {
  try {
    const tag = request.nextUrl.searchParams.get('tag')

    if (!tag) {
      return success({ csrfToken: null })
    }

    if (!ALLOWED_TAGS.includes(tag) && !tag.match(/^[a-zA-Z0-9_-]{1,64}$/)) {
      return success({ csrfToken: null })
    }

    const token = generateCsrfToken(tag)
    await storeCsrfToken(token).catch(() => {})

    return success({ csrfToken: token })
  } catch (err) {
    return error(err)
  }
}
