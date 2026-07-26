import { sanitizeText, sanitizeHtml } from './sanitize';

describe('sanitizeText', () => {
  it('strips all HTML tags leaving plain text', () => {
    expect(sanitizeText('<b>hello</b>')).toBe('hello');
    expect(sanitizeText('<script>alert(1)</script>')).toBe('alert(1)');
    expect(sanitizeText('plain text')).toBe('plain text');
  });

  it('strips self-closing tags', () => {
    expect(sanitizeText('<img src="x" />')).toBe('');
  });

  it('returns empty string for tag-only input', () => {
    expect(sanitizeText('<div></div>')).toBe('');
  });
});

describe('sanitizeHtml — XSS vector tests', () => {
  // ── Script injection ──────────────────────────────────────────────────────

  it('removes <script> tags and their content', () => {
    expect(sanitizeHtml('<script>alert(1)</script>')).not.toContain('alert');
    expect(sanitizeHtml('<SCRIPT>alert(1)</SCRIPT>')).not.toContain('alert');
  });

  it('removes script with extra whitespace in tag', () => {
    expect(sanitizeHtml('<script  >alert(1)</  script>')).not.toContain('alert');
  });

  it('removes script with type attribute', () => {
    expect(sanitizeHtml('<script type="text/javascript">alert(1)</script>')).not.toContain('alert');
  });

  // ── Event handler attributes ──────────────────────────────────────────────

  it('strips onclick on an otherwise allowed tag', () => {
    const out = sanitizeHtml('<p onclick="alert(1)">text</p>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('text');
  });

  it('strips onerror on disallowed img tag', () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('img');
  });

  it('strips onmouseover with unquoted value', () => {
    const out = sanitizeHtml('<p onmouseover=alert(1)>text</p>');
    expect(out).not.toContain('onmouseover');
  });

  it('strips on* attributes with single quotes', () => {
    const out = sanitizeHtml("<p onload='alert(1)'>text</p>");
    expect(out).not.toContain('onload');
  });

  it('strips onfocus on a disallowed input tag', () => {
    const out = sanitizeHtml('<input onfocus="alert(1)" autofocus>');
    expect(out).not.toContain('onfocus');
  });

  // ── javascript: URL scheme ────────────────────────────────────────────────

  it('strips javascript: href on disallowed <a> tag', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript:');
  });

  it('strips javascript: with leading whitespace', () => {
    const out = sanitizeHtml('<p class=" javascript:alert(1)">text</p>');
    // class attribute with javascript: value should be stripped
    expect(out).not.toContain('javascript:');
  });

  // ── vbscript: and data: URL schemes ──────────────────────────────────────

  it('strips vbscript: scheme', () => {
    const out = sanitizeHtml('<p class="vbscript:msgbox(1)">text</p>');
    expect(out).not.toContain('vbscript:');
  });

  it('strips data: scheme in class attribute', () => {
    const out = sanitizeHtml('<p class="data:text/html,<script>alert(1)</script>">text</p>');
    expect(out).not.toContain('data:');
  });

  // ── Dangerous tags ────────────────────────────────────────────────────────

  it('removes <iframe> tags', () => {
    const out = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
    expect(out).not.toContain('iframe');
  });

  it('removes <svg> tags (which can carry onload)', () => {
    const out = sanitizeHtml('<svg onload="alert(1)"></svg>');
    expect(out).not.toContain('svg');
    expect(out).not.toContain('onload');
  });

  it('removes <object> and <embed> tags', () => {
    expect(sanitizeHtml('<object data="x.swf"></object>')).not.toContain('object');
    expect(sanitizeHtml('<embed src="x.swf">')).not.toContain('embed');
  });

  it('removes <form> tags', () => {
    const out = sanitizeHtml('<form action="https://evil.com"><input name="x"></form>');
    expect(out).not.toContain('form');
  });

  it('removes <base> tag (which can redirect all links)', () => {
    const out = sanitizeHtml('<base href="https://evil.com">');
    expect(out).not.toContain('base');
  });

  it('removes <meta> tags', () => {
    const out = sanitizeHtml('<meta http-equiv="refresh" content="0;url=https://evil.com">');
    expect(out).not.toContain('meta');
  });

  // ── Disallowed tags stripped but content kept ─────────────────────────────

  it('strips disallowed <div> but keeps inner text', () => {
    expect(sanitizeHtml('<div>hello</div>')).toBe('hello');
  });

  it('strips <span> but keeps text', () => {
    expect(sanitizeHtml('<span>world</span>')).toBe('world');
  });

  // ── Allowed tags and attributes preserved ─────────────────────────────────

  it('keeps allowed structural tags', () => {
    const out = sanitizeHtml('<p>text</p><strong>bold</strong><em>italic</em>');
    expect(out).toContain('<p>text</p>');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
  });

  it('keeps class attribute on allowed tags', () => {
    const out = sanitizeHtml('<p class="note">text</p>');
    expect(out).toContain('class="note"');
  });

  it('preserves list structure', () => {
    const out = sanitizeHtml('<ul><li>item</li></ul>');
    expect(out).toContain('<ul>');
    expect(out).toContain('<li>item</li>');
  });

  // ── Polyglot / obfuscation vectors ────────────────────────────────────────

  it('handles mixed-case event handler', () => {
    const out = sanitizeHtml('<p OnClick="alert(1)">text</p>');
    expect(out).not.toContain('OnClick');
    expect(out).not.toContain('onclick');
  });

  it('strips unknown disallowed attribute without quotes', () => {
    const out = sanitizeHtml('<p id=main>text</p>');
    // id is not in ALLOWED_ATTRS — must be stripped
    expect(out).not.toContain('id=');
    expect(out).toContain('text');
  });

  it('handles multiple XSS vectors in one string', () => {
    const dirty = '<script>evil()</script><p onclick="bad()">hello</p><img src=x onerror=alert(1)>';
    const out = sanitizeHtml(dirty);
    expect(out).not.toContain('evil');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('img');
    expect(out).toContain('hello');
  });
});
