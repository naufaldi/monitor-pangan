import { Data, DateTime, Effect } from "effect"

/** Presigned PUT lifetime. The PRD caps this at 10 minutes. */
export const PRESIGN_EXPIRES_SEC = 600

export type PresignConfig = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export class SignError extends Data.TaggedError("SignError")<{
  readonly message: string
}> {}

const encoder = new TextEncoder()

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("")

const sha256Hex = (value: string) =>
  Effect.tryPromise({
    try: () => crypto.subtle.digest("SHA-256", encoder.encode(value)).then(hex),
    catch: (cause) => new SignError({ message: String(cause) }),
  })

const hmac = (key: BufferSource, value: string) =>
  Effect.tryPromise({
    try: () =>
      crypto.subtle
        .importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
        .then((cryptoKey) => crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value))),
    catch: (cause) => new SignError({ message: String(cause) }),
  })

const amzStamp = (nowMs: number): { dateStamp: string; amzDate: string } => {
  const iso = DateTime.formatIso(DateTime.unsafeMake(nowMs))
  const dateStamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}`
  const amzDate = `${dateStamp}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`
  return { dateStamp, amzDate }
}

/**
 * SigV4 PUT for `pending/<id>.jpg`. The key is chosen here, not by the browser.
 * Expires in 600 seconds. Unsigned payload, host is the only signed header.
 */
export const presignPendingPut = (config: PresignConfig, id: string, nowMs: number) =>
  Effect.gen(function* () {
    const { dateStamp, amzDate } = amzStamp(nowMs)
    const host = `${config.accountId}.r2.cloudflarestorage.com`
    const key = `pending/${id}.jpg`
    const canonicalUri = `/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`
    const scope = `${dateStamp}/auto/s3/aws4_request`
    const credential = `${config.accessKeyId}/${scope}`
    const query = [
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Credential", credential],
      ["X-Amz-Date", amzDate],
      ["X-Amz-Expires", String(PRESIGN_EXPIRES_SEC)],
      ["X-Amz-SignedHeaders", "host"],
    ]
      .map(([name, value]) => [encodeURIComponent(name ?? ""), encodeURIComponent(value ?? "")] as const)
      .sort((a, b) => a[0].localeCompare(b[0]))
    const canonicalQuery = query.map(([name, value]) => `${name}=${value}`).join("&")
    const canonicalHeaders = `host:${host}\n`
    const payloadHash = "UNSIGNED-PAYLOAD"
    const canonicalRequest = [
      "PUT",
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      "host",
      payloadHash,
    ].join("\n")
    const requestHash = yield* sha256Hex(canonicalRequest)
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, requestHash].join("\n")
    const kDate = yield* hmac(encoder.encode(`AWS4${config.secretAccessKey}`), dateStamp)
    const kRegion = yield* hmac(kDate, "auto")
    const kService = yield* hmac(kRegion, "s3")
    const kSigning = yield* hmac(kService, "aws4_request")
    const signature = hex(yield* hmac(kSigning, stringToSign))
    return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
  })
