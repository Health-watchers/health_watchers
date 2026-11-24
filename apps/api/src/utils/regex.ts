/**
 * Escape regex metacharacters so untrusted input can be embedded in a MongoDB
 * `$regex` filter as a literal substring match instead of a pattern — prevents
 * ReDoS (catastrophic backtracking) from attacker-controlled search strings.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
