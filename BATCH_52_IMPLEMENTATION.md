# Batch-52 Implementation: Right-to-Erasure, Feature Flags, Bulk Operations, and QR Check-in

## Overview
This batch implements four critical backend features for health-watchers platform:
1. **Right-to-Erasure Workflow** (#1440)
2. **Feature-Flag Service** (#1441)
3. **Bulk Appointment Reschedule/Cancel** (#1442)
4. **QR-code Patient Self Check-in** (#1443)

---

## #1440: Right-to-Erasure Workflow (GDPR/NDPR Compliance)

### Files Created
- `apps/api/src/modules/erasure-requests/erasure-request.model.ts` - MongoDB model with states
- `apps/api/src/modules/erasure-requests/erasure.service.ts` - Handles PHI pseudonymization and execution
- `apps/api/src/modules/erasure-requests/erasure.controller.ts` - API endpoints

### Workflow States
```
requested → under_review → approved/denied → executed
```

### Key Features
- **Patient Request**: POST `/erasure-requests` with optional reason
- **Admin Approval**: POST `/erasure-requests/:id/approve` with legal-hold check
- **Legal Hold Validation**: Prevents erasure if patient has ongoing disputes
- **Execution**: Pseudonymizes PHI, keeps legally required clinical data intact
- **Immutable Audit Log**: Records all erasure actions with outcome

### Pseudonymization Strategy
- PHI fields anonymized to `ANON_<random_id>`
- Appointment references kept but chiefComplaint/notes marked REDACTED
- Stellar/financial records maintain consistency via pseudonymized references
- Portal account cascade deleted
- Communications/documents purged

### Acceptance Criteria ✅
- [x] After execution, patient PHI cannot be recovered through any API
- [x] Financial and Stellar records remain consistent
- [x] Immutable audit log records the erasure

---

## #1441: Feature-Flag Service

### Files Created
- `apps/api/src/modules/feature-flags/feature-flag.model.ts` - MongoDB model with clinic overrides
- `apps/api/src/modules/feature-flags/feature-flags.service.ts` - Redis-cached evaluation
- `apps/api/src/modules/feature-flags/feature-flags.controller.ts` - Admin CRUD + user endpoints
- `apps/api/src/modules/feature-flags/require-feature.middleware.ts` - Express middleware

### Endpoints
```
GET /feature-flags                    # User gets flags for their clinic
GET /feature-flags/:key               # Check if flag enabled
POST /feature-flags/admin/create      # SUPER_ADMIN: Create flag
PATCH /feature-flags/admin/:key       # SUPER_ADMIN: Update flag
DELETE /feature-flags/admin/:key      # SUPER_ADMIN: Delete flag
```

### Key Features
- **Global + Per-Clinic Overrides**: Each flag has default + clinic-specific settings
- **Rollout Percentage**: Gradual rollout (0-100% per flag)
- **Redis Caching**: 60-second TTL for performance
- **Cache Invalidation**: Automatic on flag updates
- **Middleware**: `requireFeature('ai')` for route protection

### Usage Example
```typescript
// Service
const isEnabled = await featureFlagsService.isEnabled('ai_features', {
  userId: req.user.id,
  clinicId: req.user.clinicId,
});

// Middleware
router.post('/ai-consultation', requireFeature('ai'), handler);
```

### Acceptance Criteria ✅
- [x] Flag toggle takes effect within 60s via Redis caching
- [x] Per-clinic overrides supported
- [x] Rollout percentage controls gradual activation

---

## #1442: Bulk Appointment Reschedule and Cancel

### Files Created
- `apps/api/src/modules/appointments/appointments-bulk.service.ts` - Bulk operation orchestration
- Updated `appointments.controller.ts` - POST `/appointments/bulk` endpoint

### Endpoint
```
POST /appointments/bulk
{
  "actions": [
    {
      "appointmentId": "...",
      "action": "reschedule" | "cancel",
      "rescheduleData": {
        "newDoctorId": "...",       // optional
        "newScheduledAt": "2026-10-01T14:00:00Z"  // required for reschedule
      },
      "cancelReason": "..."  // required for cancel
    }
  ],
  "dryRun": false  // Set true for conflict detection only
}
```

### Key Features
- **Dry-Run Mode**: Returns conflicts without modifying appointments
- **Conflict Detection**: Checks for overlapping appointments with new doctor/time
- **Atomic Per-Appointment**: Each result independently reports success/failure
- **Patient Notifications**: Email/SMS/in-app per patient preferences
- **Waitlist Integration**: Freed slots automatically offered to waitlist

### Dry-Run Response
```json
{
  "dryRun": true,
  "conflicts": [
    {
      "appointmentId": "appt1",
      "conflict": "Doctor has conflicting appointment",
      "newTime": "2026-10-02T14:00:00Z"
    }
  ]
}
```

### Acceptance Criteria ✅
- [x] Operation is atomic per appointment
- [x] Dry-run mode returns conflicts without modifications
- [x] Patients notified per preferences
- [x] Freed slots offered to waitlist

---

## #1443: QR-Code Patient Self Check-in

### Files Created
- `apps/api/src/modules/appointments/qr-checkin.service.ts` - Token generation/validation
- Updated `appointments.controller.ts` - POST `/appointments/check-in/:token` endpoint

### Token Format
```
HMAC-SHA256 signed token: BASE64(payload).SIGNATURE
- payload: appointmentId:expiryTimestamp
- expiry: 24 hours
```

### Endpoints
```
POST /appointments/check-in/:token
Response: { "status": "success", "appointmentId": "..." }
```

### Key Features
- **Signed Tokens**: HMAC-SHA256 prevents forgery
- **Time-Limited**: 24-hour validity window
- **Check-in Window**: Configurable (default: 30min before → 15min after appointment)
- **Cannot Reuse**: Once checked in, status is `patient_arrived`
- **Real-Time Update**: Socket.IO event emitted to clinic staff view
- **QR Code in Reminders**: Included in appointment reminder emails

### Check-in Window Validation
```
✗ 40 minutes before       (outside 30-min window)
✓ 20 minutes before       (within window)
✓ At appointment time     (within window)
✓ 10 minutes after        (within 15-min after window)
✗ 30 minutes after        (outside window)
```

### Acceptance Criteria ✅
- [x] Tokens cannot be reused
- [x] Tokens cannot be forged (HMAC-SHA256)
- [x] Time-limited (24 hours)
- [x] Front-desk view updates in real-time via Socket.IO
- [x] QR code included in reminder emails

---

## Integration Points

### Module Dependencies
```
erasure-requests
├── audit (immutable logging)
├── appointments (pseudonymize references)
└── patients (PHI redaction)

feature-flags
├── redis (caching)
└── patients/appointments (usage via middleware)

appointments-bulk
├── waitlist (offer freed slots)
└── notifications (patient notifications)

qr-checkin
├── socket.io (real-time updates)
└── notifications (reminder emails)
```

### Environment Variables Required
```bash
# QR Check-in
QR_CHECKIN_SECRET=<secure-random-string>
API_URL=https://api.health-watchers.com

# Feature Flags (uses existing Redis)
REDIS_URL=redis://localhost:6379
```

### Database Indexes
All models include appropriate indexes for:
- Status queries (erasure-requests)
- Clinic/flag lookups (feature-flags)
- Appointment conflict detection (appointments-bulk)

---

## Testing

Test suite located at: `apps/api/src/modules/__tests__/batch-52-features.test.ts`

Coverage includes:
- Erasure workflow state transitions
- Legal hold validation
- PHI pseudonymization
- Feature flag evaluation with rollout percentages
- Clinic overrides precedence
- Bulk operation conflict detection
- Token generation and signature validation
- Check-in time window enforcement
- Token reuse prevention

---

## Migration Checklist

Before production deployment:
1. Run test suite: `npm run test -- batch-52-features.test.ts`
2. Verify Redis connectivity for feature-flag caching
3. Set `QR_CHECKIN_SECRET` environment variable
4. Create initial feature flags via admin endpoints
5. Test erasure workflow end-to-end with legal hold
6. Verify Socket.IO events with QR check-in
7. Load-test bulk operations with large appointment sets
