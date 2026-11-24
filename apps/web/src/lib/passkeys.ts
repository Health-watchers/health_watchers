import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

/** Staff passkeys (WebAuthn) — issue #1496. All calls go through the Next.js /api/auth proxies. */

export interface Passkey {
  id: string;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

interface CeremonyOptions<T> {
  data: { challengeId: string; options: T };
}

export type PasskeySignInResult =
  | { status: 'success' }
  | { status: 'mfa_required'; tempToken: string; methods: string[] };

export const passkeysSupported = (): boolean =>
  typeof window !== 'undefined' && browserSupportsWebAuthn();

async function postJson<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message ?? `Request failed (${res.status})`);
  return json as T;
}

/** Map the browser's WebAuthn errors to something a clinician can act on. */
export function passkeyErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'NotAllowedError') return 'The passkey prompt was cancelled or timed out.';
    if (err.name === 'InvalidStateError') return 'This device already has a passkey for you.';
    return err.message;
  }
  return 'Passkey request failed. Please try again.';
}

export async function listPasskeys(): Promise<Passkey[]> {
  const res = await fetch('/api/auth/passkeys', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load passkeys');
  const body = await res.json();
  return body.data ?? [];
}

/** Runs the registration ceremony. Returns backup codes when this is the first passkey. */
export async function registerPasskey(
  name: string
): Promise<{ passkey: Passkey; backupCodes?: string[] }> {
  const { data } = await postJson<CeremonyOptions<PublicKeyCredentialCreationOptionsJSON>>(
    '/api/auth/passkeys/register/options'
  );
  const response = await startRegistration({ optionsJSON: data.options });
  const verified = await postJson<{ data: { passkey: Passkey; backupCodes?: string[] } }>(
    '/api/auth/passkeys/register/verify',
    { challengeId: data.challengeId, response, ...(name ? { name } : {}) }
  );
  return verified.data;
}

export async function renamePasskey(id: string, name: string): Promise<void> {
  await postJson(`/api/auth/passkeys/${encodeURIComponent(id)}`, { name }, 'PATCH');
}

export async function removePasskey(id: string): Promise<void> {
  await postJson(`/api/auth/passkeys/${encodeURIComponent(id)}`, undefined, 'DELETE');
}

/**
 * Sign in with a passkey. Without a temp token this is a usernameless sign-in; with one it
 * completes the MFA step after a password login. Auth cookies are set by the proxy route.
 */
export async function signInWithPasskey(tempToken?: string): Promise<PasskeySignInResult> {
  const body = tempToken ? { tempToken } : {};
  const { data } = await postJson<CeremonyOptions<PublicKeyCredentialRequestOptionsJSON>>(
    '/api/auth/passkeys/login/options',
    body
  );
  const response = await startAuthentication({ optionsJSON: data.options });
  const result = await postJson<{
    status: string;
    data: { tempToken: string; methods: string[] };
  }>('/api/auth/passkeys/login/verify', {
    challengeId: data.challengeId,
    response,
    ...body,
  });
  if (result.status === 'mfa_required') {
    return {
      status: 'mfa_required',
      tempToken: result.data.tempToken,
      methods: result.data.methods,
    };
  }
  return { status: 'success' };
}
