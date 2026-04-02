import crypto from 'crypto';
import { authenticator } from 'otplib';

export function generateSecret(): string {
  return authenticator.generateSecret();
}

export function generateURI({ label, issuer, secret }: { label: string; issuer: string; secret: string }): string {
  return authenticator.keyuri(label, issuer, secret);
}

export async function totpVerify({ token, secret }: { token: string; secret: string }): Promise<{ valid: boolean }> {
  const valid = authenticator.verify({ token, secret });
  return { valid };
}
