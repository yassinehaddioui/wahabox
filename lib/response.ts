import { NextResponse } from 'next/server'
import { ApiError } from './errors'

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
  if (err instanceof ApiError) {
    return NextResponse.json(
      { success: false as const, error: err.message, code: err.code },
      { status: err.statusCode },
    )
  }

  const message = err instanceof Error ? err.message : 'Internal server error'
  return NextResponse.json(
    { success: false as const, error: message },
    { status: 500 },
  )
}
