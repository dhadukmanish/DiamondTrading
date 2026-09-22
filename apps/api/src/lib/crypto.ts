import { createHash, randomBytes } from 'node:crypto'

/**
 * Opaque, high-entropy token used as the refresh token's payload. It is handed
 * to the client inside a signed JWT and stored server-side only as a hash.
 */
export function generateOpaqueToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url')
}

/** SHA-256 hex digest. Used to index refresh tokens without storing them. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
