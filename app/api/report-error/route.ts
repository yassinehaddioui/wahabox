import { NextRequest } from 'next/server'
import { z } from 'zod'
import { success, error } from '@/lib/response'
import { ApiError, BadRequestError, RateLimitError } from '@/lib/errors'
import { checkIpRate } from '@/lib/rate-limit'
import { reportError } from '@/lib/reporter'

const reportSchema = z
  .object({
    message: z.string().max(2048),
    code: z.string().max(64).optional(),
    stackFirstFrame: z.string().max(512).optional(),
    route: z.string().max(256).optional(),
  })
  .strict()

export async function POST(request: NextRequest) {
  // 1. Content-Type guard
  if ((request.headers.get('content-type') ?? '') !== 'application/json') {
    return error(new ApiError('Expected application/json', 415, 'UNSUPPORTED_MEDIA_TYPE'))
  }

  // 2. Size guard
  const cl = request.headers.get('content-length')
  if (cl && parseInt(cl, 10) > 4096) {
    return error(new ApiError('Payload too large', 413, 'PAYLOAD_TOO_LARGE'))
  }

  // 3. Zod strict parse
  let body: z.infer<typeof reportSchema>
  try {
    const raw = await request.json()
    const result = reportSchema.safeParse(raw)
    if (!result.success) {
      return error(new BadRequestError('Invalid payload'))
    }
    body = result.data
  } catch {
    return error(new BadRequestError('Invalid JSON body'))
  }

  // 4. IP extraction — same pattern as auth/login/route.ts lines 44-47
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  // 5. Rate-limit per-IP (fires BEFORE reportError so abuse doesn't trigger reporting)
  if (await checkIpRate('report:' + ip, { windowMs: 60_000, max: 10 })) {
    return error(new RateLimitError())
  }

  // 6. Build a synthetic error — a plain Error (NOT an ApiError), so it WILL be reported
  const synth = new Error(body.message)
  synth.name = body.code ?? 'ClientError'

  // 7. Fire-and-forget report.
  //    Intentionally does NOT validate CSRF —
  //    client-side render errors cannot carry a CSRF token.
  void reportError(synth, { source: 'client', ip, route: body.route })

  // 8. Always success — never surfaces internal state
  return success({ ok: true }, 202)
}
