import { escapeRegex } from './regex';

describe('escapeRegex', () => {
  it('escapes regex metacharacters', () => {
    expect(escapeRegex('a.b*c?d')).toBe('a\\.b\\*c\\?d');
    expect(escapeRegex('(foo|bar)')).toBe('\\(foo\\|bar\\)');
    expect(escapeRegex('[a-z]+')).toBe('\\[a-z\\]\\+');
  });

  it('leaves plain strings untouched', () => {
    expect(escapeRegex('hello world')).toBe('hello world');
  });

  it('neutralizes a catastrophic-backtracking ReDoS payload as a literal match', () => {
    const payload = 'a++++++++++++++++++++++++++++!';
    const escaped = escapeRegex(payload);
    const start = Date.now();
    // eslint-disable-next-line security/detect-non-literal-regexp -- verifying escapeRegex neutralizes the payload
    new RegExp(escaped, 'i').test('some unrelated text that does not match');
    expect(Date.now() - start).toBeLessThan(50);
  });
});
