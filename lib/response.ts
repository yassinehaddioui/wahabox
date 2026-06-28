import { NextResponse } from 'next/server'
import { ApiError } from './errors'
import { MfaRequiredError } from './errors'
import { MessageNotAvailableError } from './errors'

type SuccessResponse<T = unknown> = {
  success: true
  data: T
}

type ErrorResponse = {
  success: false
  error: string
  code?: string
}

export function success<T>(data: T, status = 200): NextResponse<SuccessResponse<T>> {
  return NextResponse.json({ success: true as const, data }, { status })
}

export function error(err: unknown): NextResponse<ErrorResponse> {
  if (err instanceof MfaRequiredError) {
    return NextResponse.json(
      {
        success: false as const,
        error: err.message,
        code: err.code,
        mfaToken: err.mfaToken,
        methods: err.methods,
      },
      { status: err.statusCode },
    )
  }

  if (err instanceof MessageNotAvailableError) {
    return NextResponse.json(
      {
        success: false as const,
        error: err.message,
        code: err.code,
        startDate: err.startDate ?? undefined,
      },
      { status: err.statusCode },
    )
  }

  if (err instanceof ApiError) {
    return NextResponse.json(
      { success: false as const, error: err.message, code: err.code },
      { status: err.statusCode },
    )
  }

  console.error('[internal]', err)
  return NextResponse.json(
    { success: false as const, error: 'Internal server error' },
    { status: 500 },
  )
}
