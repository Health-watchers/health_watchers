/**
 * Unit tests for redact.ts
 */
import { redactConnectionString } from './redact';

describe('redactConnectionString', () => {
  it('redacts password from mongodb:// credentials', () => {
    expect(redactConnectionString('mongodb://user:secret@host:27017/db')).toBe(
      'mongodb://***@host:27017/db'
    );
  });

  it('redacts only the credential portion, preserving the rest of the URI', () => {
    const result = redactConnectionString(
      'mongodb://admin:p@ssw0rd@cluster.example.com:27017/healthdb?authSource=admin'
    );
    expect(result).toBe('mongodb://***@cluster.example.com:27017/healthdb?authSource=admin');
  });

  it('leaves URIs without credentials untouched', () => {
    expect(redactConnectionString('mongodb://localhost:27017/db')).toBe(
      'mongodb://localhost:27017/db'
    );
  });

  it('redacts passwords that themselves contain @ characters', () => {
    // The password is `contains@inpass`; everything up to the final `@` must be
    // redacted so the credential is never leaked.
    expect(redactConnectionString('mongodb://user:contains@inpass@host/db')).toBe(
      'mongodb://***@host/db'
    );
  });
});
