# ADR-009: Escrow Contract State Machine and Rent

## Status

Accepted

## Date

2026-11-23

## Context

The Soroban escrow contract (`contracts/escrow/src/lib.rs`) holds payment
between a patient and a clinic until service is delivered or the escrow
expires. Four issues revealed that the contract had no coherent state
machine and did not pay storage rent:

- `cancel()` returned funds to the patient at any time before expiry, even
  after a visit, so the escrow gave the clinic no guarantee (#1829).
- `release()` did not check `expires_at`, so after the TTL elapsed the clinic
  could still race the patient's `refund()` (#1830).
- No `extend_ttl` was ever called, so persistent escrow records and the
  instance nonce could be archived once the default ledger TTL elapsed,
  blocking `release`, `refund`, and `get_escrow` (#1831).
- `deposit()` accepted any token address, so a fake token could make an
  escrow look funded to off-chain systems (#1832).

## Decision

Define and enforce a single state machine, and keep every storage entry
alive for the contract's lifetime:

1. **Cancel cooling-off window.** `cancel()` is allowed only while
   `ledger().timestamp() < created_at + CANCEL_WINDOW_SECS` (24 hours). After
   the window the patient can no longer pull funds back; the clinic's claim is
   protected for the remainder of the escrow lifetime.

2. **Release before expiry.** `release()` now rejects calls once
   `ledger().timestamp() >= expires_at`. After expiry only `refund()`
   succeeds. Expiry therefore has one clear meaning: it ends the clinic's
   right to release and starts the patient's right to refund.

3. **Storage rent.** Every read and write of a persistent escrow record and of
   the instance nonce calls `extend_ttl(key, STORAGE_THRESHOLD,
   STORAGE_EXTEND_TO)` with `STORAGE_EXTEND_TO = 518_400` ledgers (~30 days),
   comfortably longer than the 14-day business expiry (`ESCROW_TTL_SECS`). The
   admin and allow-list entries are likewise extended on access. This keeps
   records available without relying on a later restore.

4. **Token allow-list.** `initialize()` (one-time, admin-authorised) stores an
   admin account and an allow-list of approved tokens. `deposit()` rejects
   any token not on the list with `Error::TokenNotAllowed` before any transfer
   occurs. `set_allowed_tokens()` lets the admin replace the list.

Resulting lifecycle while `Active`: deposit -> (within 24h: patient may
cancel) -> (until expiry: clinic may release) -> (after expiry: patient may
refund). `dispute()` remains available while `Active`. A disputed record is
neither releasable nor refundable until resolved off-chain.

## Consequences

### Positive

- The clinic is guaranteed payment once the cooling-off window passes and
  before expiry.
- Expiry is unambiguous: it switches the active right from the clinic
  (release) to the patient (refund).
- Escrow records and the nonce stay available for the full business lifetime
  without manual restores.
- Only vetted tokens (e.g. approved Stellar Asset Contracts) can fund
  escrows, so off-chain reconciliation can trust a "deposited" event.

### Negative / Trade-offs

- A patient who discovers a problem more than 24 hours after deposit cannot
  self-serve a cancel; they must use `dispute()` (off-chain resolution) or
  wait for expiry to refund.
- Callers pay a small rent cost on every read/write that triggers an
  `extend_ttl` (the SDK only extends when remaining TTL is below
  `STORAGE_THRESHOLD`, so most calls are cheap no-ops).
- The contract must be initialised before the first deposit, and the admin
  key is a single point of control for the allow-list.

### Neutral

- The on-chain state machine is now explicit and matches the doc comments.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Cancel allowed only with clinic co-authorisation | Requires changing `cancel()`'s signature and clinic involvement for every refund; the cooling-off window protects the clinic without that friction. |
| Expiry auto-triggers refund (no explicit `refund()`) | Pushes automatic transfers on-chain and complicates dispute handling; an explicit patient-initiated `refund()` is simpler and auditable. |
| Allow-list enforced only off-chain (API/stellar-service) | Off-chain checks are bypassable; the contract is the trust boundary, so enforcement belongs on-chain. |
| Larger `STORAGE_EXTEND_TO` (e.g. ~1 year) | Higher worst-case rent with no benefit over a value that already exceeds the 14-day business expiry. |

## References

- `contracts/escrow/src/lib.rs`
- Issues #1829, #1830, #1831, #1832
- `docs/adr/ADR-000-template.md`
