import { z } from 'zod';

const passkeyName = z.string().trim().min(1, 'Name is required').max(64);

// WebAuthn response payloads are validated structurally by @simplewebauthn/server;
// here we only enforce the envelope so malformed bodies are rejected early.
const credentialResponse = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    type: z.literal('public-key'),
    response: z.record(z.unknown()),
  })
  .passthrough();

export const passkeyRegisterVerifySchema = z.object({
  challengeId: z.string().uuid(),
  response: credentialResponse,
  name: passkeyName.optional(),
});

export const passkeyLoginOptionsSchema = z.object({
  tempToken: z.string().min(1).optional(),
});

export const passkeyLoginVerifySchema = z.object({
  challengeId: z.string().uuid(),
  response: credentialResponse,
  tempToken: z.string().min(1).optional(),
});

export const passkeyRenameSchema = z.object({
  name: passkeyName,
});

export type PasskeyRegisterVerifyDto = z.infer<typeof passkeyRegisterVerifySchema>;
export type PasskeyLoginOptionsDto = z.infer<typeof passkeyLoginOptionsSchema>;
export type PasskeyLoginVerifyDto = z.infer<typeof passkeyLoginVerifySchema>;
export type PasskeyRenameDto = z.infer<typeof passkeyRenameSchema>;
