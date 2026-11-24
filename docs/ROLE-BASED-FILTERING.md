# Role-Based Response Field Filtering

## Overview

The Health Watchers API implements role-based response field filtering to ensure sensitive data is only visible to authorized roles. This is applied automatically to all API responses.

## Field Filter Rules

### Financial / Billing Fields
| Field | Description | Allowed Roles |
|---|---|---|
| `billingCode` | Internal billing code for the service | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR |
| `paymentDetails` | Detailed payment transaction information | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR |
| `invoiceAmount` | Invoice amount in billing currency | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR |
| `cost` | Internal cost data | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR |
| `reimbursementRate` | Insurance reimbursement rate | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR |

### Insurance Sensitive Fields
| Field | Description | Allowed Roles |
|---|---|---|
| `policyNumber` | Insurance policy number | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR, NURSE |
| `groupNumber` | Insurance group number | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR, NURSE |
| `insuranceProvider` | Insurance provider name | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR, NURSE |
| `coverageDetails` | Detailed insurance coverage information | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR, NURSE |

### Government Identifiers
| Field | Description | Allowed Roles |
|---|---|---|
| `ssn` | Social Security Number | SUPER_ADMIN, CLINIC_ADMIN |
| `nationalId` | National identity number | SUPER_ADMIN, CLINIC_ADMIN |

### Internal / Audit Fields
| Field | Description | Allowed Roles |
|---|---|---|
| `auditTrail` | Internal audit trail of changes | SUPER_ADMIN, CLINIC_ADMIN |
| `internalNotes` | Internal clinical notes not visible to patients | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR |
| `systemNotes` | Internal system-generated notes | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR |

### Staff-Only Fields
| Field | Description | Allowed Roles |
|---|---|---|
| `salary` | Staff salary information | SUPER_ADMIN, CLINIC_ADMIN |
| `performanceNotes` | Staff performance notes | SUPER_ADMIN, CLINIC_ADMIN |

### Diagnostic / AI Fields
| Field | Description | Allowed Roles |
|---|---|---|
| `aiConfidence` | AI diagnostic confidence score | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR |
| `aiRawOutput` | Raw AI model output | SUPER_ADMIN, CLINIC_ADMIN, DOCTOR |

### Compliance / Research Fields
| Field | Description | Allowed Roles |
|---|---|---|
| `complianceFlags` | Compliance violation flags | SUPER_ADMIN, CLINIC_ADMIN |
| `breachRisk` | HIPAA breach risk assessment | SUPER_ADMIN, CLINIC_ADMIN |

## Role Hierarchy

```
SUPER_ADMIN > CLINIC_ADMIN > DOCTOR > NURSE > ASSISTANT > READ_ONLY > PATIENT
```

- **SUPER_ADMIN**: Sees everything (no filtering applied)
- **CLINIC_ADMIN**: Sees all except staff salary/performance
- **DOCTOR**: Sees clinical data, billing, AI diagnostics, but not admin-only identifiers
- **NURSE**: Sees clinical data and insurance, but not billing or government IDs
- **ASSISTANT**: Sees basic data only, no billing/insurance/notes
- **READ_ONLY**: Sees basic data only, no sensitive fields
- **PATIENT**: Sees their own data only, no billing/notes/identifiers

## How It Works

### Middleware Layer (`response-filter.middleware.ts`)

The `responseFilterMiddleware` intercepts `res.json()` calls on all `/api/v1/*` and `/api/v2/*` routes. When a response is sent:

1. The middleware checks `req.user.role`
2. If the role is `SUPER_ADMIN` or not set, the response is passed through unchanged
3. For other roles, the middleware recursively walks the response object
4. Any field listed in `FIELD_RULES` that the role is not authorized to see is removed
5. The filtered response is sent to the client

### Transformer Layer (`*.transformer.ts`)

Individual module transformers apply role-based filtering at the field mapping level:

- `toAppointmentResponse(doc, role)` - Filters appointment data
- `toLabResultResponse(doc, role)` - Filters lab result data
- `toPatientResponse(doc)` - Maps patient data (no role filtering needed, patients see their own)
- `toEncounterResponse(doc)` - Maps encounter data
- `toPaymentResponse(doc)` - Maps payment data

### Utility Layer (`response.transformer.ts`)

Provides reusable functions:

- `stripRestrictedFields(data, role)` - Filters a flat object
- `stripRestrictedFieldsDeep(data, role)` - Recursively filters nested objects and arrays

## Testing Field Access

Run the test suite:

```bash
npx jest apps/api/src/__tests__/unit/response-filter.test.ts
```

## Adding New Field Rules

To restrict a new field, add an entry to `FIELD_RULES` in `response-filter.middleware.ts`:

```typescript
{
  field: 'mySensitiveField',
  allowedRoles: ['SUPER_ADMIN', 'CLINIC_ADMIN'],
  description: 'Description of what this field contains',
},
```

The middleware will automatically strip this field from responses for roles not in the allowed list.
