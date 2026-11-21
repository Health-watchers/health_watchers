import sanitizeHtmlLib from 'sanitize-html';

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

// Tags allowed in rich-text (TipTap) SOAP notes. Anything not listed here is
// dropped by sanitize-html (its content is kept unless it is a script/style
// style element, which sanitize-html removes together with its content).
const ALLOWED_TAGS = [
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
  'a',
  'code',
];

// Attributes allowed per tag. Event handlers (on*) are never allowed because
// they are not in this list, and sanitize-html drops them regardless.
const ALLOWED_ATTRIBUTES: sanitizeHtmlLib.IOptions['allowedAttributes'] = {
  a: ['href', 'target', 'rel'],
  '*': ['class'],
};

// Only these URL schemes may appear in `href`. sanitize-html normalises the
// value (decoding entities, trimming whitespace/control chars) before matching,
// so `javascript:`, `vbscript:` and `data:` URLs are rejected.
const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];

const SANITIZE_OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesByTag: { a: ALLOWED_SCHEMES },
  // Drop the href entirely when the scheme is not allowed.
  allowProtocolRelative: false,
  // Keep the text content of disallowed tags (e.g. <div>text</div> -> text).
  disallowedTagsMode: 'discard',
  // Never allow these, even if a future allow-list edit adds them.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript'],
};

/**
 * Strips disallowed HTML tags and attributes to prevent stored XSS.
 *
 * Delegates to the maintained `sanitize-html` library, which parses the input
 * with a real HTML parser (htmlparser2) rather than regexes, so malformed tags,
 * nested contexts, entity encoding and SVG/MathML namespaces cannot bypass the
 * allow-list. Keeps safe formatting tags produced by TipTap.
 */
export function sanitizeHtml(input: string): string {
  return sanitizeHtmlLib(input, SANITIZE_OPTIONS);
}
