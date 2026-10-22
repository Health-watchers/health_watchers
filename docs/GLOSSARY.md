# Health Watchers Glossary

A reference for clinical, compliance, and blockchain terms used throughout the Health Watchers codebase.

## Clinical & Healthcare Terms

### SOAP
**Subjective, Objective, Assessment, Plan** — Standard format for clinical documentation.
- **Subjective**: Patient's reported symptoms and history
- **Objective**: Measurable clinical findings and test results
- **Assessment**: Clinical interpretation and diagnosis
- **Plan**: Treatment and follow-up actions

### ICD-10
**International Classification of Diseases, 10th Revision** — WHO standardized diagnostic codes.
- Example: `E11.9` = Type 2 diabetes mellitus without complications
- Used for billing, research, and clinical documentation
- Replaces ICD-9 (36,000 codes → 70,000 codes)

### CPT
**Current Procedural Terminology** — AMA codes for medical procedures and services.
- Example: `99213` = Office visit, established patient, low to moderate complexity
- Used for billing and claims processing
- Different from ICD-10 (diagnosis vs. procedure)

### CVX
**CVX Vaccine Codes** — CDC standardized vaccine identifiers.
- Example: `207` = COVID-19 vaccine, Moderna
- Used in immunization records and registries
- Maintained by CDC's National Center for Immunization and Respiratory Diseases

### PHI
**Protected Health Information** — Any health data that can identify an individual.
- Includes: name, DOB, SSN, medical record numbers, diagnoses, lab results
- Regulated under HIPAA; must be encrypted at rest and in transit
- Health Watchers encrypts PHI using AES-256

### ORU
**Order Result (OBX) Message** — HL7 message type for lab results.
- Sent by labs to EHR/hospital systems
- Contains: order info, specimen data, results, reference ranges
- Standard format in healthcare IT systems

### BAA
**Business Associate Agreement** — HIPAA contract between covered entities and service providers.
- Required for any third-party handling PHI (e.g., cloud providers, analytics services)
- Defines responsibilities, liability, and incident notification
- Health Watchers must maintain BAAs with all service providers

### EHR
**Electronic Health Record** — Digital version of a patient's medical record.
- Includes: demographics, medical history, medications, allergies, lab results, notes
- Different from EMR (Electronic Medical Record — single provider's record)
- Interoperability enables data sharing between providers

### Compliance Record
In Health Watchers: status of a patient's clearance to receive/send payments.
- Status values: `Approved`, `Suspended`, `Rejected`, `Pending`
- Includes expiry date and jurisdiction restrictions
- Used to enforce geographic and regulatory constraints

---

## Compliance & Regulatory Terms

### HIPAA
**Health Insurance Portability and Accountability Act** — US federal law protecting patient privacy.
- Regulates covered entities (hospitals, insurers, healthcare providers) and business associates
- Key rules: Privacy Rule (§164.500-534), Security Rule (§164.308-320), Breach Notification (§164.400-414)
- Penalties: $100-$50,000 per violation; up to $1.5M per calendar year per rule
- Health Watchers implements: encryption (§164.312), audit logging (§164.312(b)), access controls (§164.312(a))

### HIPAA Security Rule
§164.308-320 — Technical, administrative, and physical safeguards for ePHI.
- §164.312(a)(2)(iv): Field-level encryption for PHI at rest
- §164.312(b): Audit log encryption and protection
- §164.312(c)(1): Backup encryption required in production
- Health Watchers: Implements all required technical safeguards

### HIPAA Breach Notification
§164.400-414 — Notification requirements when PHI is compromised.
- Must notify affected individuals within 60 days
- Must notify media if >500 people affected
- Must notify HHS Office for Civil Rights (OCR)
- Health Watchers: SMTP configured for automated breach notifications

### BAA (Business Associate Agreement)
Contract between covered entity and service provider (e.g., Health Watchers cloud provider).
- Service provider must implement same security/privacy protections
- Shared liability for breaches
- Required before processing any PHI on behalf of a covered entity

### CLIA
**Clinical Laboratory Improvement Amendments** — Regulates laboratory testing.
- Covers: moderate-complexity labs (most hospital/clinic labs) and high-complexity labs
- Requires: CLIA certificate, quality controls, personnel qualifications
- Health Watchers: May process lab results but does not operate a lab (not CLIA-regulated)

### OSHA
**Occupational Safety and Health Administration** — Workplace safety regulations.
- OSHA Bloodborne Pathogens Standard: Protects workers from exposure to blood/body fluids
- Health Watchers: Relevant for any physical testing facilities (not core to platform)

### Data Retention
HIPAA minimum: 6 years for clinical records and 6 years for audit logs.
- Health Watchers default: 7 years for clinical, 6 years for audit logs
- Determined by `CLINICAL_RETENTION_YEARS` and `AUDIT_LOG_RETENTION_YEARS` env vars
- Older records are automatically purged per retention policy

---

## Stellar Blockchain Terms

### Stellar
Open-source blockchain platform for payments and digital assets.
- Native currency: Lumens (XLM)
- Focus: Fast, low-cost cross-border payments and asset issuance
- Used by Health Watchers for transparent, immutable payment tracking

### XLM (Lumens)
Native cryptocurrency of the Stellar network.
- Used for: Transaction fees (~0.00001 XLM), reserves, and bridging currencies
- 1 billion XLM created at genesis; 0.5% annual inflation (until 2019)
- Smallest unit: 1 stroople = 0.0000001 XLM

### Testnet
Stellar test network — separate from mainnet, free XLM for testing.
- Used for development and testing; data resets periodically
- Can create test accounts and test assets without real value
- Health Watchers default: `STELLAR_NETWORK=testnet`

### Mainnet
Stellar production network — real XLM transactions, real money.
- Data is permanent; transactions cannot be reversed
- Requires `MAINNET_CONFIRMED=true` to prevent accidental mainnet use
- Health Watchers: Guards against accidental mainnet transactions with explicit safety gate

### Trustline
Authorization for an account to hold and transact a non-native (custom) asset.
- Required before an account can receive custom assets (e.g., USDC)
- Trustee (issuer) can freeze trustlines if needed
- Health Watchers: Manages trustlines for supported assets (USDC, EURC, etc.)

### Claimable Balance
Stellar feature for conditional payments and escrow.
- Payment can be claimed by recipient only if conditions are met
- Used for: Conditional payments, time-locked payments, escrow
- Health Watchers: Uses claimable balances for escrow functionality

### Asset Issuer
Stellar account that creates and issues a custom asset (e.g., USDC issuer on Stellar).
- Issuer: The entity that stands behind the asset and maintains full reserve
- Example: Circle (Stellar USDC issuer) maintains 1:1 USDC reserve
- Health Watchers: Tracks issuer reputation and compliance status

### SEP (Stellar Ecosystem Protocol)
Standards for Stellar integrations and interoperability.
- SEP-1: Stellar.toml configuration file
- SEP-6: Federated payments
- SEP-24: Hosted deposit and withdrawal
- SEP-31: Cross-border payments
- Health Watchers: Implements SEP standards for payment routing

### Keypair
Public and private key pair for Stellar accounts.
- Public key: Account identifier (starts with 'G'), can be shared
- Secret key: Signs transactions, must be kept secure
- Health Watchers: Stores server-side signing key securely, never exposes to clients

### Server-Side Signing
Health Watchers signs all Stellar transactions on the API server.
- Never sends secret key to client
- Client requests transaction; server creates, signs, and submits
- Prevents key exposure and ensures transaction integrity

### Transaction Fee
Cost to submit a transaction to Stellar network.
- Current: ~0.00001 XLM per operation (very cheap)
- Example: 5-operation transaction ≈ 0.00005 XLM (< $0.000001 at current rates)
- Health Watchers: Covers transaction fees for payment operations

---

## Platform-Specific Terms

### Payment Intent
Health Watchers term for a pending payment request.
- Status: Pending → Confirmed → Settled
- Expires after `PAYMENT_INTENT_EXPIRY_HOURS` (default: 24 hours)
- Can be cancelled if not confirmed

### Confirmed Payment
Payment submitted to Stellar and received blockchain confirmation (finality).
- Cannot be reversed on blockchain; only refundable by new payment
- Posted to audit log immediately upon confirmation
- Different from "settled" (payment fully processed in accounting system)

### Compliance Gate
Regulatory check before payment is allowed.
- Checks: Recipient approved, jurisdiction not blocked, transaction limits respected
- Health Watchers: Enforces via `api-key.middleware.ts` and compliance schema
- Triggers breach notification if violation detected

### Rate Limiting
Protection against abuse — limits requests per time window.
- In-memory: Per-pod (not shared across instances)
- Redis: Distributed rate limiting across all API instances
- Production: Requires REDIS_URL for proper brute-force protection

### Field Encryption
HIPAA § 164.312(a)(2)(iv) — AES-256 encryption for specific PHI fields at rest.
- Fields: Name, DOB, SSN, medical record number, diagnoses
- Key: 64-char hex string (32 bytes)
- Rotation: Annually, with old key kept during migration period

---

## Development Glossary

### Monorepo
Single repository containing multiple projects (apps, packages, services).
- Health Watchers structure: `apps/` (API, web), `packages/` (shared), `sdks/` (client libraries)
- Tool: Turbo for build orchestration
- Benefits: Unified versioning, shared dependencies, simplified deployment

### Middleware
Function that processes request/response in a pipeline.
- Express middleware: (req, res, next) → processes and calls next()
- Uses: Authentication, logging, CORS, rate limiting, error handling
- Health Watchers: Consolidated in `middlewares/` directory (issue #1511)

### Async Handler
Utility to wrap async route handlers and catch promise rejections.
- Prevents unhandled promise rejections from crashing server
- Passes errors to Express error middleware
- Health Watchers: Canonical version in `utils/asyncHandler.ts`

### Zod Schema
Runtime type validation library for TypeScript.
- Validates data at runtime (different from static TS types)
- Used in Health Watchers for environment validation
- Provides detailed error messages for invalid values

---

## Quick Reference

| Term | Type | Definition |
|------|------|-----------|
| SOAP | Clinical | Subjective, Objective, Assessment, Plan documentation format |
| ICD-10 | Clinical | International diagnosis classification codes |
| CPT | Clinical | Procedure and service billing codes |
| CVX | Clinical | Vaccine identifier codes |
| PHI | Compliance | Protected Health Information — any identifying health data |
| HIPAA | Compliance | Federal law protecting patient privacy |
| BAA | Compliance | Business Associate Agreement — required service provider contract |
| XLM | Blockchain | Stellar network native currency |
| Testnet | Blockchain | Stellar test network (free, data resets) |
| Mainnet | Blockchain | Stellar production network (real money) |
| Trustline | Blockchain | Authorization to hold custom assets |
| Claimable Balance | Blockchain | Conditional/escrowed payment |

