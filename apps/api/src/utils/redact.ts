export function redactConnectionString(uri: string): string {
  // Redact everything between `//user:` and the LAST `@` — passwords may
  // legitimately contain `@` characters (e.g. mongodb://u:p@ss@host/db).
  return uri.replace(/\/\/[^:@/]+:.*@/, '//***@');
}
