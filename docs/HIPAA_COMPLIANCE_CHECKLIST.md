# HIPAA Compliance Checklist for Contributors

This checklist helps contributors verify HIPAA compliance for changes affecting Protected Health Information (PHI).

**Last updated**: 2026-10-17  
**Compliance Reference**: SECURITY.md, SECURITY_POLICY.md

---

## Pre-Merge Checklist

**Before creating or merging a PR that touches PHI:**

- [ ] I have reviewed the PHI fields affected by this change (see below)
- [ ] All new PHI fields are encrypted at rest using `FIELD_ENCRYPTION_KEY`
- [ ] All PHI access is logged via `createAuditLog()`
- [ ] I have verified data flows do not expose PHI in logs or error messages
- [ ] Encryption keys are rotated annually (as documented in ENV_REFERENCE.md)
- [ ] I understand the audit logging requirements for my changes

---

## PHI Field Reference

### Patient Model

**Encrypted Fields** (must use `FIELD_ENCRYPTION_KEY`):
- `ssn` — Social Security Number
- `mrn` — Medical Record Number
- `dateOfBirth` — Date of birth (can be used for age discrimination)
- `sex` — Biological sex
- `allergies[].substance` — Allergy details
- `medications[].name`, `dosage`, `frequency` — Medication info
- `diagnoses[]` — Clinical diagnoses
- `surgicalHistory[]` — Past surgeries

**Non-Encrypted but PHI** (still require audit logging):
- `firstName`, `lastName` — Patient name
- `contactNumber` — Phone number
- `address` — Patient address
- `emergencyContacts[]` — Emergency contact info

### Encounter Model

**Encrypted Fields**:
- `reason` — Chief complaint
- `diagnosis` — Clinical diagnosis
- `assessment` — Provider assessment
- `plan` — Treatment plan
- `notes` — Clinical notes
- `vitals.*` — All vital signs
- `prescriptions[].medication` — Medication names/dosages

**Non-Encrypted but PHI**:
- `patientId` — Reference to patient
- `clinicId` — Clinic identifier
- `providerId` — Provider identifier
- `createdAt`, `updatedAt` — Timestamps

### Lab Results Model

**Encrypted Fields**:
- `testName` — Name of lab test
- `result` — Lab result value
- `normalRange` — Reference range
- `status` — Critical/abnormal indicator
- `notes` — Lab notes

**Non-Encrypted but PHI**:
- `patientId`, `encounterId` — References
- `testedAt` — Date of test

---

## Encryption Implementation Guide

### Adding a New Encrypted PHI Field

**1. Update the Mongoose schema** (in model file):
```typescript
import { encryptDecrypt } from '@api/utils/encryption.util';

const patientSchema = new Schema({
  // ... other fields ...
  newPhiField: {
    type: String,
    encrypt: true,  // Enable encryption
    required: true,
  }
});

// Apply encryption middleware
patientSchema.pre('save', async function() {
  if (this.isModified('newPhiField')) {
    this.newPhiField = encryptDecrypt(this.newPhiField, 'encrypt');
  }
});
```

**2. Update the transformer** (to decrypt for API responses):
```typescript
export function toPatientResponse(patient) {
  return {
    id: patient._id,
    firstName: patient.firstName,
    // Decrypt PHI before returning
    newPhiField: encryptDecrypt(patient.newPhiField, 'decrypt'),
  };
}
```

**3. Add audit logging** (in controller):
```typescript
await auditLog(env, {
  userId: req.user.id,
  clinicId: req.user.clinicId,
  action: 'PATIENT_UPDATE',
  resourceType: 'Patient',
  resourceId: patientId,
  outcome: 'SUCCESS',
  metadata: {
    fieldsModified: ['newPhiField'],
    reason: req.body.reason // Why was this changed?
  }
});
```

---

## Audit Logging Requirements

### When to Call `createAuditLog()`

**ALWAYS log:**
- [ ] Patient data access (view, list, search)
- [ ] Patient data modifications (create, update, delete)
- [ ] Encounter creation and updates
- [ ] Lab result access
- [ ] Export or download of PHI
- [ ] Authentication events (login, logout, MFA)
- [ ] Authorization failures (e.g., access denied)

**Example audit log calls**:
```typescript
// Log patient access
await auditLog(env, {
  userId: req.user.id,
  clinicId: req.user.clinicId,
  action: 'PATIENT_VIEW',
  resourceType: 'Patient',
  resourceId: patientId,
  outcome: 'SUCCESS'
});

// Log failed access attempt
await auditLog(env, {
  userId: req.user.id,
  clinicId: req.user.clinicId,
  action: 'PATIENT_VIEW',
  resourceType: 'Patient',
  resourceId: patientId,
  outcome: 'FAILURE',
  metadata: {
    reason: 'User does not have permission to access this patient'
  }
});

// Log export with details
await auditLog(env, {
  userId: req.user.id,
  clinicId: req.user.clinicId,
  action: 'EXPORT_PATIENT_DATA',
  resourceType: 'Patient',
  resourceId: patientId,
  outcome: 'SUCCESS',
  metadata: {
    format: 'CSV',
    fieldCount: 25,
    timestamp: new Date()
  }
});
```

### Audit Log Model Schema

Reference: `apps/api/src/modules/audit/audit.model.ts`

```typescript
interface AuditLog {
  userId?: ObjectId;           // Who took the action
  clinicId?: ObjectId;        // Which clinic
  action: AuditAction;        // What action (enum)
  resourceType?: string;      // What resource (Patient, Encounter, etc.)
  resourceId?: string;        // Which specific resource
  ipAddress?: string;         // From where
  userAgent?: string;         // Using what client
  outcome: 'SUCCESS' | 'FAILURE';  // Did it succeed
  metadata?: Record<string, unknown>;  // Additional context
  timestamp: Date;            // When
}
```

---

## Data Flow & Logging Checklist

For each endpoint that touches PHI:

**Question**: Does this endpoint access, modify, or return PHI?
- [ ] Yes → Continue below
- [ ] No → Skip to next endpoint

**Question**: Is all PHI encrypted at rest?
- [ ] Yes → Continue
- [ ] No → Add encryption (see section above)

**Question**: Is access to this PHI logged?
- [ ] Yes → Continue
- [ ] No → Add `auditLog()` call in controller

**Question**: Could PHI leak into logs/errors?
- [ ] No → Safe to proceed
- [ ] Yes → Use `sanitizePhiForLogging()` or avoid logging PHI entirely

**Example safe logging**:
```typescript
// ❌ BAD — logs PHI
logger.error(`Failed to update patient ${patient.ssn}`, error);

// ✅ GOOD — logs only ID
logger.error(`Failed to update patient ${patient._id}`, error);

// ✅ GOOD — uses sanitization utility
logger.error(`Failed to process patient`, {
  patientId: patient._id,
  error: error.message // NOT error.data which might contain PHI
});
```

---

## Encryption Key Rotation

**Annual rotation required by HIPAA:**

1. **Generate new key**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Update environment**:
   ```bash
   # In production secrets manager
   FIELD_ENCRYPTION_KEY=<new_key_hex>
   ```

3. **Re-encrypt data**:
   ```bash
   npm run scripts:reencrypt-fields --old-key <old_key> --new-key <new_key>
   ```

4. **Audit trail**:
   - Log the rotation event
   - Record who rotated the key and when
   - Verify all data is accessible with new key

---

## Common Mistakes to Avoid

### ❌ Logging PHI

```typescript
// DON'T
logger.info(`Patient ${patient.ssn} viewed by user ${userId}`);
console.error(`Encounter for ${patient.firstName} not found`);
```

### ❌ Storing PHI in URLs

```typescript
// DON'T
GET /api/patients?name=John&ssn=123-45-6789

// DO
GET /api/patients/:id
```

### ❌ Forgetting Audit Logs

```typescript
// DON'T
async function getPatient(id) {
  return PatientModel.findById(id);  // No audit log!
}

// DO
async function getPatient(id) {
  const patient = PatientModel.findById(id);
  await auditLog(env, {
    action: 'PATIENT_VIEW',
    resourceId: id,
    outcome: 'SUCCESS'
  });
  return patient;
}
```

### ❌ Unencrypted New Fields

```typescript
// DON'T — sensitive data left unencrypted
phoneNumber: { type: String }  // Plaintext!

// DO — mark sensitive fields for encryption
phoneNumber: { type: String, encrypt: true }
```

---

## Testing Your Changes

**Before submitting PR:**

1. **Verify encryption works**:
   ```bash
   # Temporarily log the encrypted field value
   const encrypted = patient.newPhiField;  // Should be garbled hex
   const decrypted = encryptDecrypt(encrypted, 'decrypt');  // Should be plaintext
   ```

2. **Verify audit logging**:
   ```bash
   # Check that audit logs are created
   db.audit_logs.find({ resourceId: "test_patient_id" })
   ```

3. **Verify no PHI in logs**:
   ```bash
   # Search logs for SSN/MRN patterns
   grep -r "^\d{3}-\d{2}-\d{4}" logs/
   ```

4. **Check Sentry for leaked PHI**:
   - Visit Sentry dashboard
   - Search for error messages
   - Verify no SSN/MRN/diagnosis appears in stack traces

---

## PR Template Update

**Add this to your PR description:**

```markdown
## HIPAA Compliance Checklist

- [ ] This change does/does not touch PHI
- [ ] All new PHI fields are encrypted at rest
- [ ] All PHI access is logged via `createAuditLog()`
- [ ] No PHI appears in logs, error messages, or URLs
- [ ] Encryption keys are properly configured
- [ ] Changes comply with SECURITY.md and SECURITY_POLICY.md
```

---

## Resources

- **SECURITY.md** — Comprehensive security guide
- **SECURITY_POLICY.md** — HIPAA compliance policies
- **ENV_REFERENCE.md** — Encryption key configuration
- **audit.model.ts** — Audit log schema and validation
- **encryption.util.ts** — Encryption/decryption utilities
- **Compliance Scripts**: `scripts/audit/generate-compliance-report.sh`

---

## Questions?

- Review `SECURITY.md` and `SECURITY_POLICY.md` first
- Check existing audit log implementations in other endpoints
- Ask in #security Slack channel
- Open a compliance issue: https://github.com/Health-Watchers/health_watchers/issues/new?template=security.md
