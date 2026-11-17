import { SubmitBodySchema, type SubmitBody } from "./laporan.ts"

/**
 * The normalized report fields captured for one submission UUID. A retry resends these verbatim:
 * the backend replay is immutable, so editable field values must never ride a stable idempotency key.
 */
export const AttemptSchema = SubmitBodySchema.omit("turnstileToken")
export type ReportAttempt = typeof AttemptSchema.Type

/**
 * The Worker rejects 400 (invalid field or Turnstile) and 503 (photo upload unconfigured) before any
 * insert, so nothing was persisted. Every other failure (network loss, 500, an undecodable 200) may
 * have stored the row, so the original attempt must be preserved and resent unchanged.
 */
export function isDefiniteReject(status: number): boolean {
  return status === 400 || status === 503
}

/** A retry derives its body from the captured attempt, never from the current editable fields. */
export function retryBody(attempt: ReportAttempt, turnstileToken: string): SubmitBody {
  return { ...attempt, turnstileToken }
}