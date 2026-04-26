/**
 * Strips ALL HTML tags — use for plain-text fields.
 */
export function sanitizeText(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

// Tags and attributes allowed in rich-text (TipTap) SOAP notes
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'u', 's',
  'h2', 'h3', 'ul', 'ol', 'li',
  'blockquote', 'hr',
]);

const ALLOWED_ATTRS = new Set(['class']);

/**
 * Strips disallowed HTML tags and attributes to prevent stored XSS.
 * Keeps safe formatting tags produced by TipTap.
 */
export function sanitizeHtml(input: string): string {
  // Remove script/style blocks entirely (including content)
  let out = input.replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Strip disallowed tags but keep their inner text
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag: string, attrs: string) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return '';

    // Strip disallowed attributes from allowed tags
    const safeAttrs = attrs.replace(/(\w[\w-]*)=["'][^"']*["']/g, (attrMatch, name: string) => {
      if (!ALLOWED_ATTRS.has(name.toLowerCase())) return '';
      // Block javascript: in any attribute value
      if (/javascript:/i.test(attrMatch)) return '';
      return attrMatch;
    });

    return `<${tag}${safeAttrs}>`;
  });

  return out;
}
