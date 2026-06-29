/**
 * Strips ALL HTML tags — use for plain-text fields.
 */
export function sanitizeText(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

// Tags and attributes allowed in rich-text (TipTap) SOAP notes
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
]);

const ALLOWED_ATTRS = new Set(['class']);

// Dangerous URL schemes that can execute script in browsers
const DANGEROUS_URL_RE = /^\s*(javascript|vbscript|data)\s*:/i;

/**
 * Strips disallowed HTML tags and attributes to prevent stored XSS.
 * Handles quoted and unquoted attributes, event handlers (on*), and
 * dangerous URL schemes (javascript:, vbscript:, data:).
 * Keeps safe formatting tags produced by TipTap.
 */
export function sanitizeHtml(input: string): string {
  // Remove dangerous block elements entirely (including all inner content)
  let out = input.replace(
    /<(script|style|iframe|object|embed|form|base|link|meta|svg|math|template)(\s[^>]*)?>[\s\S]*?<\/\s*\1\s*>/gi,
    ''
  );
  // Also strip self-closing or unclosed dangerous tags
  out = out.replace(
    /<(script|style|iframe|object|embed|form|base|link|meta|svg|math|template)(\s[^>]*)?>/gi,
    ''
  );

  // Strip disallowed tags but keep their inner text
  out = out.replace(
    /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\b[^>]*)>/g,
    (match, slash: string, tag: string, attrs: string) => {
      const lower = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(lower)) return '';

      if (slash) return `</${tag}>`;

      const safeAttrs = buildSafeAttrs(attrs);
      return `<${tag}${safeAttrs}>`;
    }
  );

  return out;
}

/**
 * Parses a raw attribute string and returns only the permitted attributes,
 * rejecting event handlers and dangerous URL schemes.
 */
function buildSafeAttrs(attrStr: string): string {
  let result = '';
  // Matches: name="value", name='value', name=value, name (boolean)
  const attrRe = /([a-zA-Z][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';

    // Block all event handlers
    if (name.startsWith('on')) continue;
    // Block only permitted attributes
    if (!ALLOWED_ATTRS.has(name)) continue;
    // Block dangerous URL schemes in attribute values
    if (DANGEROUS_URL_RE.test(value)) continue;

    result += value ? ` ${name}="${value}"` : ` ${name}`;
  }
  return result;
}
