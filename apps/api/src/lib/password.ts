import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Password hashing using Node's built-in scrypt.
 *
 * scrypt is memory-hard and ships with Node, so there is no native module to
 * compile and no extra dependency to keep patched. Parameters are stored inside
 * the hash string, which lets them be raised later without invalidating
 * existing hashes.
 *
 * Encoded form: `scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>`
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

const PARAMS = {
  /** CPU/memory cost. 2^14 needs ~16 MiB per hash. */
  N: 16384,
  r: 8,
  p: 1,
  keylen: 32,
  saltBytes: 16,
  /** Node's default maxmem is 32 MiB; give scrypt explicit headroom. */
  maxmem: 64 * 1024 * 1024,
} as const

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(PARAMS.saltBytes)
  const derived = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: PARAMS.maxmem,
  })

  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

/**
 * Verifies a password against an encoded hash. Returns false rather than
 * throwing for malformed input so a corrupt row cannot turn into a 500.
 */
export async function verifyPassword(
  password: string,
  encoded: string | null | undefined,
): Promise<boolean> {
  if (!encoded) return false

  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts
  const N = Number(rawN)
  const r = Number(rawR)
  const p = Number(rawP)
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false
  if (!rawSalt || !rawHash) return false

  const salt = Buffer.from(rawSalt, 'base64')
  const expected = Buffer.from(rawHash, 'base64')
  if (salt.length === 0 || expected.length === 0) return false

  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: PARAMS.maxmem,
    })
    // Both buffers are the same length by construction, so timingSafeEqual is
    // safe to call directly.
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** True when a stored hash was produced with weaker parameters than current. */
export function needsRehash(encoded: string | null | undefined): boolean {
  if (!encoded) return false
  const parts = encoded.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true
  return Number(parts[1]) < PARAMS.N
}
