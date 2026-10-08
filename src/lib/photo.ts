import { Data, Effect } from "effect"

/** Long edge cap for a citizen photo. Canvas re-encode drops EXIF. */
export const PHOTO_MAX_EDGE = 1600

export class PhotoError extends Data.TaggedError("PhotoError")<{
  readonly message: string
}> {}

/** Scale so the longer side is at most `maxEdge`. Smaller images stay as they are. */
export function fittedSize(
  width: number,
  height: number,
  maxEdge = PHOTO_MAX_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const edge = Math.max(width, height)
  if (edge <= maxEdge) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxEdge / edge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** True when a JPEG still carries an EXIF APP1 segment. */
export function jpegHasExif(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false
  let offset = 2
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return false
    const marker = bytes[offset + 1] ?? 0
    if (marker === 0xda || marker === 0xd9) return false
    const size = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
    if (size < 2) return false
    if (marker === 0xe1) {
      const header = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8))
      return header === "Exif"
    }
    offset += 2 + size
  }
  return false
}

/**
 * Draw the image into a canvas and encode JPEG.
 * The new file has no EXIF because the pixels are copied, not the original bytes.
 */
export const downscaleToJpeg = (file: Blob) =>
  Effect.tryPromise({
    try: () =>
      createImageBitmap(file).then((bitmap) => {
        const size = fittedSize(bitmap.width, bitmap.height)
        if (size.width > PHOTO_MAX_EDGE || size.height > PHOTO_MAX_EDGE || size.width < 1) {
          bitmap.close()
          return Promise.reject(new Error("size"))
        }
        const canvas = document.createElement("canvas")
        canvas.width = size.width
        canvas.height = size.height
        const context = canvas.getContext("2d")
        if (context == null) {
          bitmap.close()
          return Promise.reject(new Error("canvas"))
        }
        context.drawImage(bitmap, 0, 0, size.width, size.height)
        bitmap.close()
        return new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob == null) reject(new Error("jpeg"))
            else resolve(blob)
          }, "image/jpeg", 0.85)
        }).then((blob) => blob.arrayBuffer().then((buffer) => ({ blob, bytes: new Uint8Array(buffer), size })))
      }),
    catch: (cause) => new PhotoError({ message: String(cause) }),
  }).pipe(
    Effect.flatMap((encoded) =>
      jpegHasExif(encoded.bytes)
        ? Effect.fail(new PhotoError({ message: "exif" }))
        : Effect.succeed(encoded.blob),
    ),
  )
