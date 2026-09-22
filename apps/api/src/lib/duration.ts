/**
 * Parses the compact duration strings used for token lifetimes (`15m`, `2h`,
 * `7d`, or a bare number of seconds) into seconds.
 *
 * The same string is handed to the JWT signer, so this only has to agree with
 * it - it is not a general-purpose duration parser.
 */
const PATTERN = /^(\d+)\s*(s|m|h|d)?$/i

const MULTIPLIER: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
}

export function durationToSeconds(value: string, fallbackSeconds = 900): number {
  const match = PATTERN.exec(value.trim())
  if (!match) return fallbackSeconds

  const amount = Number(match[1])
  const unit = (match[2] ?? 's').toLowerCase()
  const multiplier = MULTIPLIER[unit] ?? 1

  return amount * multiplier
}

export function addSeconds(from: Date, seconds: number): Date {
  return new Date(from.getTime() + seconds * 1000)
}

export function addDays(from: Date, days: number): Date {
  return addSeconds(from, days * 86400)
}
