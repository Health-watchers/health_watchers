# HIPAA Audit Logging Implementation

This module implements HIPAA-compliant audit logging as required by 45 CFR § 164.312(b).

## Features

- **Immutable Audit Logs**: Logs cannot be updated or deleted via API or database hooks
- **Comprehensive Event Tracking**: Logs all access to ePHI including logins, patient views, and data modifications
- **IP and User Agent Tracking**: Captures network information for security analysis
- **SUPER_ADMIN Access Only**: Audit log retrieval restricted to SUPER_ADMIN role
- **Date Range Filtering**: Query logs by date range for compliance reporting
- **Pagination Support**: Efficient retrieval of large audit datasets

## Logged Events

- `LOGIN_SUCCESS`: Successful user authentication
- `LOGIN_FAILURE`: Failed login attempts
- `PATIENT_VIEW`: Patient record access
- `PATIENT_CREATE`: New patient record creation
- `PATIENT_UPDATE`: Patient record modification
- `PATIENT_DELETE`: Patient record deletion
- `ENCOUNTER_VIEW`: Encounter record access
- `ENCOUNTER_CREATE`: New encounter creation
- `ENCOUNTER_UPDATE`: Encounter modification
- `PAYMENT_CREATE`: Payment transaction creation
- `EXPORT_PATIENT_DATA`: Patient data export operations

## API Endpoint

### GET /api/v1/audit-logs

Retrieve audit logs (SUPER_ADMIN only)

**Query Parameters:**
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 50, max: 100): Records per page
- `startDate` (ISO 8601): Filter from this date
- `endDate` (ISO 8601): Filter until this date
- `action` (string): Filter by action type
- `userId` (string): Filter by user ID

**Example:**
```
GET /api/v1/audit-logs?startDate=2026-01-01&endDate=2026-03-26&action=PATIENT_VIEW&page=1&limit=50
```

## Usage

### Manual Audit Logging

```typescript
import { auditLog } from '../audit/audit.service';

await auditLog(
  {
    action: 'PATIENT_VIEW',
    resourceType: 'Patient',
    resourceId: patientId,
    userId: req.user?.userId,
    clinicId: req.user?.clinicId,
    outcome: 'SUCCESS',
  },
  req
);
```

### Automatic Audit Logging via Middleware

```typescript
import { auditMiddleware } from '../../middlewares/audit.middleware';

router.get('/:id', auditMiddleware('PATIENT_VIEW', 'Patient'), async (req, res) => {
  // Your route handler
});
```

## Database Schema

Audit logs are stored in the `audit_logs` collection with the following indexes:
- `timestamp` (descending)
- `userId + timestamp`
- `clinicId + timestamp`
- `action + timestamp`
- `resourceId`

## Compliance Notes

- Audit logs are immutable and cannot be modified or deleted
- All ePHI access is logged with timestamp, user, and IP address
- Logs are retained indefinitely for compliance purposes
- Access to audit logs is restricted to SUPER_ADMIN role only
