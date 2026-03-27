/**
 * Strips HTML tags from a string to prevent stored XSS.
 * Preserves plain text including special characters (e.g. O'Brien, <3 mg/dL).
 */
export function sanitizeText(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}
