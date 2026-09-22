/**
 * Escapes the LIKE/ILIKE wildcards so a user-supplied search term is matched
 * literally. `\` is the default escape character in Postgres.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`)
}

/** Builds a `%term%` pattern for a case-insensitive "contains" search. */
export function containsPattern(term: string): string {
  return `%${escapeLike(term.trim())}%`
}
