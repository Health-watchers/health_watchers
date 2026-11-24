/**
 * Passkey (WebAuthn) service — issue #1496
 *
 * Wraps @simplewebauthn/server for staff passkey registration and authentication.
 * Challenges are persisted server-side (TTL collection) and are single-use: they are
 * deleted as soon as a verification attempt consumes them.
 */
import crypto from 'crypto';
import { Types } from 'mongoose';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PasskeyModel, Passkey, PasskeyTransport } from '../models/passkey.model';
import { WebAuthnChallengeModel, WebAuthnCeremony } from '../models/webauthn-challenge.model';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const MAX_PASSKEYS_PER_USER = 10;

function rpId(): string {
  return process.env.WEBAUTHN_RP_ID || process.env.RP_ID || 'localhost';
}

function rpName(): string {
  return process.env.WEBAUTHN_RP_NAME || 'Health Watchers';
}

/** Accepted origins — comma-separated so web + staging hosts can share one API. */
function expectedOrigins(): string[] {
  return (process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

async function storeChallenge(
  challenge: string,
  ceremony: WebAuthnCeremony,
  userId?: string
): Promise<string> {
  const challengeId = crypto.randomUUID();
  await WebAuthnChallengeModel.create({
    challengeId,
    challenge,
    ceremony,
    userId,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return challengeId;
}

/** Atomically fetch-and-delete so a challenge can never be replayed. */
async function consumeChallenge(challengeId: string, ceremony: WebAuthnCeremony) {
  const doc = await WebAuthnChallengeModel.findOneAndDelete({ challengeId, ceremony });
  if (!doc || doc.expiresAt.getTime() < Date.now()) return null;
  return doc;
}

export async function createRegistrationOptions(user: {
  id: string;
  email: string;
  fullName: string;
}): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const existing = await PasskeyModel.find({ userId: user.id }).select('credentialId transports');

  const options = await generateRegistrationOptions({
    rpName: rpName(),
    rpID: rpId(),
    userName: user.email,
    userDisplayName: user.fullName,
    userID: Buffer.from(user.id, 'utf8'),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({
      id: p.credentialId,
      transports: p.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });

  const challengeId = await storeChallenge(options.challenge, 'registration', user.id);
  return { challengeId, options };
}

export async function verifyRegistration(params: {
  userId: string;
  challengeId: string;
  response: RegistrationResponseJSON;
  name: string;
}): Promise<(Passkey & { _id: Types.ObjectId }) | null> {
  const stored = await consumeChallenge(params.challengeId, 'registration');
  if (!stored || stored.userId !== params.userId) return null;

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: params.response,
      expectedChallenge: stored.challenge,
      expectedOrigin: expectedOrigins(),
      expectedRPID: rpId(),
      requireUserVerification: true,
    });
  } catch {
    return null;
  }
  if (!verification.verified || !verification.registrationInfo) return null;

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const doc = await PasskeyModel.create({
    userId: params.userId,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: (credential.transports ?? []) as PasskeyTransport[],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    name: params.name,
  });
  return doc.toObject();
}

/**
 * Authentication options. With a userId the request is scoped to that user's
 * credentials (passkey as second factor); without one it is a usernameless login
 * that relies on a discoverable credential.
 */
export async function createAuthenticationOptions(
  userId?: string
): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const allowCredentials = userId
    ? (await PasskeyModel.find({ userId }).select('credentialId transports')).map((p) => ({
        id: p.credentialId,
        transports: p.transports as AuthenticatorTransportFuture[],
      }))
    : undefined;

  const options = await generateAuthenticationOptions({
    rpID: rpId(),
    allowCredentials,
    userVerification: 'required',
  });

  const challengeId = await storeChallenge(options.challenge, 'authentication', userId);
  return { challengeId, options };
}

/** Returns the owning user ID when the assertion is valid, otherwise null. */
export async function verifyAuthentication(params: {
  challengeId: string;
  response: AuthenticationResponseJSON;
}): Promise<{ userId: string; passkeyId: string } | null> {
  const stored = await consumeChallenge(params.challengeId, 'authentication');
  if (!stored) return null;

  const passkey = await PasskeyModel.findOne({ credentialId: params.response.id });
  if (!passkey) return null;
  // A challenge issued for a specific user can only be answered by that user's passkey
  if (stored.userId && String(passkey.userId) !== stored.userId) return null;

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: params.response,
      expectedChallenge: stored.challenge,
      expectedOrigin: expectedOrigins(),
      expectedRPID: rpId(),
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
        counter: passkey.counter,
        transports: passkey.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch {
    return null;
  }
  if (!verification.verified) return null;

  passkey.counter = verification.authenticationInfo.newCounter;
  passkey.lastUsedAt = new Date();
  await passkey.save();

  return { userId: String(passkey.userId), passkeyId: String(passkey._id) };
}
