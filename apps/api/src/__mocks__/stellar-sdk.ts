/**
 * Mock for @stellar/stellar-sdk — the real package ships ESM that ts-jest
 * cannot parse, and the API only uses it for clinic keypair generation.
 */
export const Keypair = {
  random(): { publicKey(): string; secret(): string } {
    return {
      publicKey: () => 'G-MOCK-PUBLIC-KEY-1234567890',
      secret: () => 'S-MOCK-SECRET-KEY-1234567890',
    };
  },
};
