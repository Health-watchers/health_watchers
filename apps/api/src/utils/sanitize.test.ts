/**
 * Unit tests for sanitize.ts
 */
import { sanitizeText, sanitizeHtml } from './sanitize';

describe('sanitizeText', () => {
  it('strips all HTML tags', () => {
    expect(sanitizeText('<b>bold</b> and <i>italic</i>')).toBe('bold and italic');
  });

  it('strips nested inline tags', () => {
    expect(sanitizeText('<p>Hello <strong>World</strong></p>')).toBe('Hello World');
  });

  it('returns plain text unchanged', () => {
    expect(sanitizeText('No markup here')).toBe('No markup here');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeText('')).toBe('');
  });
});

describe('sanitizeHtml', () => {
  it('removes script blocks entirely, including contents', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    expect(sanitizeHtml(input)).toContain('<p>');
    expect(sanitizeHtml(input)).not.toContain('alert');
    expect(sanitizeHtml(input)).not.toContain('<script');
  });

  it('removes style blocks entirely, including contents', () => {
    const input = '<style>body{display:none}</style><p>Ok</p>';
    const out = sanitizeHtml(input);
    expect(out).toContain('<p>');
    expect(out).not.toContain('display:none');
  });

  it('strips disallowed tags but keeps inner text', () => {
    const out = sanitizeHtml('<p>Keep</p><div>Drop</div><span>Also</span>');
    expect(out).toContain('<p>Keep</p>');
    expect(out).not.toContain('<div>');
    expect(out).not.toContain('<span>');
    expect(out).toContain('Drop');
    expect(out).toContain('Also');
  });

  it('keeps allowed formatting tags', () => {
    const out = sanitizeHtml('<p><strong>bold</strong> <em>em</em> <u>under</u></p>');
    expect(out).toContain('<strong>');
    expect(out).toContain('<em>');
    expect(out).toContain('<u>');
  });

  it('keeps only the allowed "class" attribute', () => {
    const out = sanitizeHtml('<p class="x">ok</p><p onclick="alert(1)" id="y" class="z">a</p>');
    expect(out).toContain('class="x"');
    expect(out).toContain('class="z"');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('id="');
  });

  it('blocks javascript: URIs in attribute values', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('self-closing void-like tags on allowed list are handled', () => {
    const out = sanitizeHtml('<br><hr>');
    expect(out).toContain('<br>');
    expect(out).toContain('<hr>');
  });
});
