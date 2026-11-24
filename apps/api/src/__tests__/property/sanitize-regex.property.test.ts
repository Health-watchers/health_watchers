/**
 * Fuzz sanitize.ts and regex.ts with fast-check, including ReDoS-shaped input
 * (long runs of unclosed `<`, repeated openers, nested quantifier bait) under a
 * per-call time budget.
 */
import fc from 'fast-check';
import { sanitizeHtml, sanitizeText } from '../../utils/sanitize';
import { escapeRegex } from '../../utils/regex';

const NUM_RUNS = 200;
/** A linear pass over ~100 KB takes a few ms; quadratic backtracking takes seconds. */
const TIME_BUDGET_MS = 250;
const LARGE = 100_000;

const DANGEROUS_TAG_RE =
  /<(script|style|iframe|object|embed|form|base|link|meta|svg|math|template)(\s[^>]*)?>/i;
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

/** HTML-ish fragments that maximise the chance of hitting tag/attribute edge cases. */
const fragment = fc.oneof(
  fc.constantFrom(
    '<',
    '>',
    '</',
    '/>',
    '<script',
    '<script>',
    '</script>',
    '</ script >',
    '<SCRIPT a=1>',
    '<style>',
    '<svg onload=alert(1)>',
    '<p',
    '<p class="x">',
    '<p onclick="alert(1)">',
    '<a href="javascript:alert(1)">',
    '<img src=x onerror=alert(1)>',
    '<scr<script>ipt>',
    '"',
    "'",
    '=',
    ' ',
    'on',
    'javascript:',
    '\u0000',
    'Ŝåvé',
    'Ọ̀ṣun'
  ),
  fc.string({ unit: 'grapheme', maxLength: 8 })
);
const htmlish = fc.array(fragment, { maxLength: 60 }).map((parts) => parts.join(''));

/** Adversarial inputs: a short unit repeated to ~100 KB, optionally capped with `>`. */
const redosInput = fc
  .tuple(
    fc.constantFrom(
      '<',
      '<a',
      '<p ',
      '<script',
      '<script ',
      '<script>',
      '<script a',
      '</script ',
      '<p a=',
      '<p a="',
      '< ',
      '<<>',
      '<a>'
    ),
    fc.constantFrom('', '>', '</script>', 'x')
  )
  .map(([unit, end]) => unit.repeat(Math.ceil(LARGE / unit.length)) + end);

function timed<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  return { result, ms: performance.now() - start };
}

/** The original sanitizeText regex — used as an oracle on small inputs. */
const legacySanitizeText = (input: string) => input.replace(/<[^>]*>/g, '');

describe('sanitizeText properties', () => {
  it('matches the original regex semantics', () => {
    fc.assert(
      fc.property(htmlish, (input) => {
        expect(sanitizeText(input)).toBe(legacySanitizeText(input));
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('never leaves a complete tag behind', () => {
    fc.assert(
      fc.property(htmlish, (input) => {
        expect(sanitizeText(input)).not.toMatch(/<[^>]*>/);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(htmlish, (input) => {
        const once = sanitizeText(input);
        expect(sanitizeText(once)).toBe(once);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('leaves text without `<` untouched', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme' }).filter((s) => !s.includes('<')),
        (input) => {
          expect(sanitizeText(input)).toBe(input);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it(`finishes within ${TIME_BUDGET_MS}ms on ReDoS-shaped input`, () => {
    fc.assert(
      fc.property(redosInput, (input) => {
        expect(timed(() => sanitizeText(input)).ms).toBeLessThan(TIME_BUDGET_MS);
      }),
      { numRuns: 30 }
    );
  });
});

describe('sanitizeHtml properties', () => {
  it('never outputs a dangerous tag, event handler or disallowed tag', () => {
    fc.assert(
      fc.property(htmlish, (input) => {
        const out = sanitizeHtml(input);
        expect(out).not.toMatch(DANGEROUS_TAG_RE);

        for (const [, slash, tag, attrs] of out.matchAll(
          /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(\b[^>]*)>/g
        )) {
          expect(ALLOWED_TAGS.has(tag.toLowerCase())).toBe(true);
          if (slash) continue;
          // Only `class` survives, and never with a script URL.
          expect(attrs.replace(/\s+class(="[^"]*")?/g, '').trim()).toBe('');
          expect(attrs).not.toMatch(/(javascript|vbscript|data)\s*:/i);
        }
      }),
      { numRuns: NUM_RUNS * 2 }
    );
  });

  it('keeps plain text unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme' }).filter((s) => !s.includes('<') && !s.includes('>')),
        (input) => {
          expect(sanitizeHtml(input)).toBe(input);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('keeps allowed TipTap markup', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_TAGS),
        fc.string({ unit: 'grapheme', maxLength: 30 }).filter((s) => !/[<>]/.test(s)),
        (tag, text) => {
          const html = `<${tag} class="note">${text}</${tag}>`;
          expect(sanitizeHtml(html)).toBe(html);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it(`finishes within ${TIME_BUDGET_MS}ms on ReDoS-shaped input`, () => {
    fc.assert(
      fc.property(redosInput, (input) => {
        expect(timed(() => sanitizeHtml(input)).ms).toBeLessThan(TIME_BUDGET_MS);
      }),
      { numRuns: 30 }
    );
  });

  // Regression cases: each of these took seconds before the linear rewrite.
  it.each([
    ['unclosed `<` run', '<'.repeat(LARGE)],
    ['unclosed `<a` run', '<a'.repeat(LARGE / 2)],
    ['repeated unclosed `</script `', '<script>' + '</script '.repeat(LARGE / 9)],
    ['repeated `<script a` openers', '<script a'.repeat(LARGE / 9) + '>'],
    ['repeated `<script>` openers', '<script>'.repeat(LARGE / 8) + '>'],
  ])('regression: %s', (_name, input) => {
    expect(timed(() => sanitizeHtml(input)).ms).toBeLessThan(TIME_BUDGET_MS);
    expect(timed(() => sanitizeText(input)).ms).toBeLessThan(TIME_BUDGET_MS);
  });
});

describe('escapeRegex properties', () => {
  it('always produces a valid pattern that matches the input literally', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (input) => {
        const re = new RegExp(`^${escapeRegex(input)}$`);
        expect(re.test(input)).toBe(true);
      }),
      { numRuns: NUM_RUNS * 2 }
    );
  });

  it('never matches a different string of the same length', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (a, b) => {
        fc.pre(a !== b);
        expect(new RegExp(`^${escapeRegex(a)}$`).test(b)).toBe(false);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it(`neutralises catastrophic-backtracking patterns (< ${TIME_BUDGET_MS}ms)`, () => {
    fc.assert(
      fc.property(
        fc.constantFrom('(a+)+$', '(a|a)*$', '(.*a){20}', '([a-zA-Z]+)*$', '(a|aa)+$', '^(\\w+\\s?)*$'),
        fc.integer({ min: 20, max: 40 }),
        (pattern, n) => {
          const haystack = 'a'.repeat(n) + '!';
          const { ms } = timed(() => new RegExp(escapeRegex(pattern), 'i').test(haystack));
          expect(ms).toBeLessThan(TIME_BUDGET_MS);
        }
      ),
      { numRuns: 50 }
    );
  });
});
