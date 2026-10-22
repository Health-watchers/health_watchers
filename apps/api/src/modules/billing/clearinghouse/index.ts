import type { ClearinghouseProvider } from '../claim.model';
import type { ClearinghouseAdapter } from './clearinghouse.types';
import { StubClearinghouse } from './stub-clearinghouse';

export * from './clearinghouse.types';
export { StubClearinghouse } from './stub-clearinghouse';

/**
 * Availity Essentials — stub. A production adapter would POST the 837P to
 * `/availity/v1/claim-submissions`, poll `/claim-statuses` (276/277) and pull 835s from
 * `/remittances`, authenticating with the OAuth2 client-credentials flow.
 */
export class AvailityClearinghouse extends StubClearinghouse {
  constructor(settleAfterMs?: number) {
    super('availity', 'Availity Test Payer', settleAfterMs);
  }
}

/**
 * Change Healthcare (Optum) Medical Network — stub. A production adapter would call
 * `/medicalnetwork/professionalclaims/v3/submission`, `/claimstatus/v2` and the 835 report API.
 */
export class ChangeHealthcareClearinghouse extends StubClearinghouse {
  constructor(settleAfterMs?: number) {
    super('change_healthcare', 'Change Healthcare Test Payer', settleAfterMs);
  }
}

const adapters = new Map<ClearinghouseProvider, ClearinghouseAdapter>();

export function resolveProvider(value = process.env.CLEARINGHOUSE_PROVIDER): ClearinghouseProvider {
  const v = (value ?? '').toLowerCase().replace(/[-\s]/g, '_');
  if (v === 'availity') return 'availity';
  if (v === 'change_healthcare' || v === 'changehealthcare' || v === 'chc') return 'change_healthcare';
  return 'mock';
}

/** Returns the configured clearinghouse adapter (singleton per provider). */
export function getClearinghouse(provider: ClearinghouseProvider = resolveProvider()): ClearinghouseAdapter {
  let adapter = adapters.get(provider);
  if (!adapter) {
    const settle = Number(process.env.CLEARINGHOUSE_SETTLE_MS ?? 0) || 0;
    adapter =
      provider === 'availity'
        ? new AvailityClearinghouse(settle)
        : provider === 'change_healthcare'
          ? new ChangeHealthcareClearinghouse(settle)
          : new StubClearinghouse('mock', 'Mock Payer', settle);
    adapters.set(provider, adapter);
  }
  return adapter;
}

/** Test helper — replace or clear the cached adapter for a provider. */
export function setClearinghouse(provider: ClearinghouseProvider, adapter?: ClearinghouseAdapter) {
  if (adapter) adapters.set(provider, adapter);
  else adapters.delete(provider);
}
