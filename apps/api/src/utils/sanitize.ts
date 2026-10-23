/**
 * Strips ALL HTML tags — use for plain-text fields.
 *
 * Equivalent to `input.replace(/<[^>]*>/g, '')` but runs in linear time: the
 * regex rescans to the end of the string for every unclosed `<`, which is
 * quadratic (ReDoS) on input such as `'<'.repeat(50_000)`.
 */
export function sanitizeText(input: string): string {
  let out = '';
  let pos = 0;
  while (pos < input.length) {
    const open = input.indexOf('<', pos);
    if (open === -1) break;
    const close = input.indexOf('>', open + 1);
    if (close === -1) break;
    out += input.slice(pos, open);
    pos = close + 1;
  }
  return out + input.slice(pos);
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

const DANGEROUS_OPEN_TAG_RE =
  /<(script|style|iframe|object|embed|form|base|link|meta|svg|math|template)(\s[^>]*)?>/gi;

/**
 * Removes dangerous block elements entirely (including all inner content).
 *
 * Linear-time replacement for `/<(tag)(\s[^>]*)?>[\s\S]*?<\/\s*\1\s*>/gi`: once a
 * tag has no closing tag ahead, later openers of that tag are not rescanned.
 */
function stripDangerousBlocks(input: string): string {
  const unclosed = new Set<string>();
  const openRe = new RegExp(DANGEROUS_OPEN_TAG_RE.source, 'gi');
  let out = '';
  let pos = 0;
  let open: RegExpExecArray | null;
  while ((open = openRe.exec(input)) !== null) {
    const tag = open[1].toLowerCase();
    if (unclosed.has(tag)) continue;

    const closeRe = new RegExp(`<\\/\\s*${tag}\\s*>`, 'gi');
    closeRe.lastIndex = openRe.lastIndex;
    const close = closeRe.exec(input);
    if (!close) {
      unclosed.add(tag);
      continue;
    }

    out += input.slice(pos, open.index);
    pos = close.index + close[0].length;
    openRe.lastIndex = pos;
  }
  return out + input.slice(pos);
}

/**
 * Applies `transform` only up to the last `>`. Every tag pattern below must end
 * on a `>`, so nothing after it can match; leaving that tail out keeps unclosed
 * `<` runs from triggering quadratic backtracking (ReDoS).
 */
function beforeLastClose(input: string, transform: (head: string) => string): string {
  const lastClose = input.lastIndexOf('>');
  return transform(input.slice(0, lastClose + 1)) + input.slice(lastClose + 1);
}

/**
 * Strips disallowed HTML tags and attributes to prevent stored XSS.
 * Handles quoted and unquoted attributes, event handlers (on*), and
 * dangerous URL schemes (javascript:, vbscript:, data:).
 * Keeps safe formatting tags produced by TipTap.
 */
export function sanitizeHtml(input: string): string {
  let out = beforeLastClose(input, stripDangerousBlocks);
  // Also strip self-closing or unclosed dangerous tags
  out = beforeLastClose(out, (head) => head.replace(DANGEROUS_OPEN_TAG_RE, ''));

  // Strip disallowed tags but keep their inner text
  return beforeLastClose(out, (head) =>
    head.replace(
      /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\b[^>]*)>/g,
      (match, slash: string, tag: string, attrs: string) => {
        const lower = tag.toLowerCase();
        if (!ALLOWED_TAGS.has(lower)) return '';

        if (slash) return `</${tag}>`;

        const safeAttrs = buildSafeAttrs(attrs);
        return `<${tag}${safeAttrs}>`;
      }
    )
  );
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
