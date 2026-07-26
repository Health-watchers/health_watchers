export function redactConnectionString(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):([^@]+)@/, '//***@');
}
