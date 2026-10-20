# Batch-96 Refactoring Plan

## Overview
Batch-96 addresses three large-scale controller refactoring tasks to improve code maintainability and separation of concerns in the Health Watchers backend.

### Issue #1513: Consolidate the Audit Module ✅ COMPLETE

**Status**: COMPLETE

**Implementation**: 
- Deleted redundant `audit-logs.controller.ts` (simpler variant)
- Deleted unused `audit-log.model.ts` (incomplete schema)
- Kept authoritative `audit.controller.ts` (comprehensive with full-text search, cursor pagination)
- Kept authoritative `audit.model.ts` (complete HIPAA-compliant schema with 6-year TTL)
- Updated routes to remove `/audit-logs` endpoint, consolidate to `/audit`
- Updated `apps/api/src/routes/v1/index.ts` to remove duplicate imports and route mounting
- Removed obsolete jest mock from `auth.routes.test.ts`

**Rationale**: The audit module had two partial implementations with significant overlap. `audit.model.ts` is the comprehensive, HIPAA-compliant schema with full validation, while `audit-logs.controller.ts` was a simplified earlier version. Consolidation onto the comprehensive implementation reduces confusion and ensures all audit operations use the authoritative schema.

---

## Issues #1514, #1515, #1516: Large Controller Splits

These three issues involve splitting monolithic controller files (1,933–1,912 lines each) that mix routing, validation, business logic, and external service calls.

### Issue #1514: Split payments.controller.ts (1,933 lines)

**Current State**:
- Single file with ~40+ endpoints
- Mixes: routing, Stellar API calls, fee calculation, dispute handling, receipts, analytics, multisig

**Proposed Structure**:

#### `payments-balance.router.ts` (Balance & Account Management)
- `GET /fee-estimate` → fetch Stellar network fee statistics
- `GET /balance` → clinic's Stellar account balance
- `POST /trustline` → create USDC trustline
- Support endpoints for account queries

#### `payments-fund.router.ts` (Fund Transfers)
- `POST /fund` → initiate fund transfer
- `GET /paths` → fetch payment paths from Stellar
- `GET /stellar/orderbook` → query Stellar orderbook

#### `payments-sync.router.ts` (Sync & Reconciliation)
- `POST /sync` → sync payment records from Stellar
- `POST /reconciliation` → reconcile ledger with Stellar blockchain
- `GET /analytics` → payment analytics
- `GET /balance-snapshots` → historical balance data

#### `payments-receipt.router.ts` (Receipts & URIs)
- `GET /:intentId/receipt` → fetch payment receipt
- `GET /:intentId/receipt/url` → generate receipt URL
- `GET /:intentId/qr` → generate QR code for payment
- `GET /:intentId/payment-uri` → generate Stellar payment URI

#### `payments-multisig.router.ts` (Multisig Operations)
- `POST /multisig/:paymentId` → initiate multisig signing
- `GET /multisig/pending/:signer` → list pending multisig payments
- `POST /multisig/:paymentId/approve` → approve multisig
- Support endpoints for signature coordination

#### `payments-disputes.router.ts` (Dispute Management)
- `POST /:intentId/dispute` → open payment dispute
- `GET /:intentId/disputes` → list disputes for payment
- `POST /:intentId/disputes/:disputeId/resolve` → resolve dispute
- Analytics on disputes

#### `payments.service.ts` (Business Logic)
Extract core business logic:
- Payment intent lifecycle management
- Fee strategy selection and optimization
- Stellar network communication
- Dispute resolution workflows
- Balance calculation and reconciliation
- Receipt generation

#### `payments.routes.ts` (Router Aggregation)
Aggregate all sub-routers:
```typescript
router.use('/balance', paymentsBalanceRouter);
router.use('/fund', paymentsFundRouter);
router.use('/sync', paymentsSyncRouter);
router.use('/receipt', paymentsReceiptRouter);
router.use('/multisig', paymentsMultisigRouter);
router.use('/disputes', paymentsDisputesRouter);
```

**Challenges**:
- Fee optimization service is shared across multiple endpoints
- Metrics collection points scattered throughout
- Cache invalidation logic coupled with business logic
- Stellar client interactions deeply embedded

**Implementation Steps**:
1. Create service layer extracting business logic
2. Create individual routers for each domain
3. Update imports in main `payments.routes.ts`
4. Update route mounting in `v1/index.ts`
5. Ensure consistent error handling across split routers

---

### Issue #1515: Split patients.controller.ts (1,695 lines)

**Current State**:
- Single file with 100+ endpoints
- Mixes: CRUD operations, search, duplicate detection, photo management, import/export, allergies, insurance, emergency contacts, consent

**Proposed Structure**:

#### `patients-crud.router.ts` (Core CRUD)
- `GET /` → list patients (with pagination/filters)
- `POST /` → create patient
- `GET /:id` → get patient details
- `PUT /:id` → update patient
- `DELETE /:id` → delete patient
- `GET /:id/history` → audit history

#### `patients-search.router.ts` (Search & Lookup)
- `GET /search` → full-text search
- `POST /search/advanced` → advanced search with multiple filters
- `GET /by-ssn/:ssn` → lookup by SSN
- `GET /by-mrn/:mrn` → lookup by medical record number
- `POST /find-duplicates` → detect potential duplicate patients

#### `patients-photo.router.ts` (Photo Management)
- `POST /:id/photo` → upload patient photo
- `GET /:id/photo` → retrieve patient photo
- `DELETE /:id/photo` → delete patient photo
- Photo access audit trail

#### `patients-allergies.router.ts` (Allergy Management)
- `GET /:id/allergies` → list allergies
- `POST /:id/allergies` → add allergy
- `PUT /:id/allergies/:allergyId` → update allergy
- `DELETE /:id/allergies/:allergyId` → delete allergy
- `POST /:id/allergies/:allergyId/override` → override allergy warning

#### `patients-insurance.router.ts` (Insurance Management)
- `GET /:id/insurance` → list insurance plans
- `POST /:id/insurance` → add insurance plan
- `PUT /:id/insurance/:planId` → update insurance
- `DELETE /:id/insurance/:planId` → remove insurance
- Verification and eligibility checks

#### `patients-emergency-contact.router.ts` (Emergency Contacts)
- `GET /:id/emergency-contacts` → list emergency contacts
- `POST /:id/emergency-contacts` → add contact
- `PUT /:id/emergency-contacts/:contactId` → update contact
- `DELETE /:id/emergency-contacts/:contactId` → remove contact

#### `patients-import-export.router.ts` (Data Exchange)
- `POST /import` → bulk import patients
- `POST /export` → export patient data
- `GET /export/:exportId` → get export status/download
- Import/export job scheduling

#### `patients-consent.router.ts` (Consent Management)
- `GET /:id/consent` → list consents
- `POST /:id/consent` → obtain consent
- `PUT /:id/consent/:consentId` → update consent
- `POST /:id/consent/:consentId/accept` → accept consent version

#### `patients.service.ts` (Business Logic)
- Patient validation and normalization
- Duplicate detection algorithms
- Photo processing and storage
- Consent workflow orchestration
- Export/import data transformation

#### `patients.routes.ts` (Router Aggregation)
```typescript
router.use('/search', patientsSearchRouter);
router.use('/photo', patientsPhotoRouter);
router.use('/allergies', patientsAllergiesRouter);
router.use('/insurance', patientsInsuranceRouter);
router.use('/emergency-contacts', patientsEmergencyContactRouter);
router.use('/import-export', patientsImportExportRouter);
router.use('/consent', patientsConsentRouter);
router.use('/', patientsCrudRouter);
```

**Challenges**:
- Search endpoints heavily optimized with indexes
- Photo storage and CDN integration
- Import/export involves multiple formats (HL7, FHIR, CSV)
- Complex validation rules across patient fields
- Duplicate detection uses probabilistic matching

**Implementation Steps**:
1. Extract patient validation/normalization service
2. Create individual routers for each domain
3. Consolidate duplicate detection logic
4. Create import/export service
5. Update route mounting

---

### Issue #1516: Split stellar-service index.ts (1,767 lines)

**Current State**:
- Single file with server bootstrap and most route handlers
- Mixes: Express setup, Stellar API calls, transaction signing, account queries, fee calculations

**Proposed Structure**:

#### `stellar-balance.router.ts` (Balance & Account)
- `GET /account/:publicKey` → fetch account details
- `GET /account/:publicKey/balance` → fetch balance
- `GET /account/:publicKey/transactions` → transaction history
- `GET /account/:publicKey/operations` → operation details

#### `stellar-assets.router.ts` (Asset Management)
- `GET /assets` → list available assets
- `GET /assets/:code` → asset details
- `POST /assets/add-trustline` → add asset trustline
- `GET /assets/:code/stats` → asset statistics

#### `stellar-payments.router.ts` (Payment Operations)
- `POST /payments/send` → send payment
- `POST /payments/path-find` → find payment paths
- `GET /payments/:txHash` → transaction details
- `POST /payments/check-memo` → validate memo

#### `stellar-multisig.router.ts` (Multisig Coordination)
- `POST /multisig/build-tx` → build multisig transaction
- `POST /multisig/sign-tx` → sign transaction
- `GET /multisig/pending/:signer` → pending signatures
- `POST /multisig/submit-tx` → submit signed transaction

#### `stellar-orderbook.router.ts` (Market Data)
- `GET /orderbook/:buyingAsset/:sellingAsset` → order book
- `GET /trades` → recent trades
- `GET /prices` → asset prices
- `GET /exchange-rates` → exchange rates

#### `stellar-network.router.ts` (Network Info)
- `GET /network/fees` → current network fees
- `GET /network/ledgers` → ledger data
- `GET /network/capacity` → network capacity
- Health check endpoints

#### `stellar.service.ts` (Business Logic)
- Stellar SDK wrapper
- Transaction building and signing
- Fee estimation and optimization
- Path finding algorithm
- Account monitoring

#### `stellar.routes.ts` (Server Setup & Aggregation)
```typescript
const app = express();
// ... middleware setup ...
const stellar = Router();
stellar.use('/account', stellarBalanceRouter);
stellar.use('/assets', stellarAssetsRouter);
stellar.use('/payments', stellarPaymentsRouter);
stellar.use('/multisig', stellarMultisigRouter);
stellar.use('/orderbook', stellarOrderbookRouter);
stellar.use('/network', stellarNetworkRouter);
app.use('/api/v1/stellar', stellar);
```

#### `stellar-types.ts` (Type Definitions)
- Consolidate Stellar-related interfaces
- Transaction envelope types
- Fee structures
- Payment path types

**Challenges**:
- Stellar SDK requires careful transaction sequencing
- Fee calculation involves ledger state queries
- Multisig coordination is stateful
- Path finding can be expensive computationally
- Need careful error handling around network timeouts

**Implementation Steps**:
1. Extract Stellar SDK initialization into service
2. Create individual routers for logical domains
3. Move type definitions to separate file
4. Consolidate error handling
5. Update main server entry point

---

## Implementation Order

Recommended completion order (by complexity):
1. ✅ **#1513** (Audit consolidation) — COMPLETE
2. **#1514** (Payments split) — requires fee optimizer context
3. **#1515** (Patients split) — requires import/export service context
4. **#1516** (Stellar-service split) — requires Stellar SDK patterns

## Testing Strategy

For each split controller:
1. Unit tests for individual router modules
2. Integration tests verifying route mounting
3. Request/response format validation
4. Error handling consistency
5. Middleware chain validation

## Migration Checklist

- [ ] Update all import statements in consuming modules
- [ ] Update route mounting in v1/index.ts
- [ ] Update jest mocks in test files
- [ ] Verify swagger documentation paths
- [ ] Check rate limiting middleware application
- [ ] Validate RBAC/authorization middleware
- [ ] Update monitoring/metrics collection points
- [ ] Document new router/service interfaces
- [ ] Update API documentation

## Notes

- Each router should maintain backward-compatible endpoint paths
- Extract common middleware to avoid duplication
- Service layer should handle cross-router concerns (metrics, caching, logging)
- Consider feature flag migration if endpoints need gradual rollout
