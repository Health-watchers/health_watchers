# Data Export Runbook

**Service:** Health Watchers  
**Stack:** Node.js, Express, MongoDB, exceljs, pdfkit, csv-parse, AWS S3  
**Compliance:** HIPAA § 164.524 — Patient right of access; § 164.308 — data handling  
**Last Updated:** 2026-08-30  
**Owner:** Platform Engineering / Compliance  

---

## Overview

Health Watchers supports data exports in multiple formats (CSV, Excel, PDF). Exports may be patient-facing (right of access), operational (analytics, reporting), or compliance-driven (audit logs, regulatory requests). All exports of PHI must be logged in the audit trail.

---

## Export Types

| Export Type | Formats | Who Requests | API Endpoint |
|---|---|---|---|
| Patient health records | PDF, JSON | Patient / Doctor | `GET /api/v2/patients/:id/export` |
| Appointment history | CSV, Excel | Admin / Doctor | `GET /api/v2/appointments/export` |
| Audit logs | CSV, JSON | Admin / Compliance | `GET /api/v2/audit/export` |
| Payment history | CSV, Excel | Admin / Finance | `GET /api/v2/payments/export` |
| Full database export | mongodump archive | Ops / DBA | Manual (see below) |
| HIPAA data export | PDF + CSV bundle | Compliance | `GET /api/v2/hipaa/export` |

---

## User-Facing Data Export (HIPAA Right of Access)

Patients have the right to access their PHI under HIPAA § 164.524. Requests must be fulfilled within **30 days**.

### Steps

1. Patient (or their authorised representative) submits a data access request
2. Verify the requester's identity — do not export PHI without confirmed identity
3. Use the HIPAA export endpoint:
   ```bash
   TOKEN="<admin-or-patient-jwt>"
   PATIENT_ID="<mongodb-object-id>"

   curl -X GET "https://health-watchers.app/api/v2/hipaa/export?patientId=$PATIENT_ID" \
     -H "Authorization: Bearer $TOKEN" \
     -o "patient_export_${PATIENT_ID}.zip"
   ```
4. Deliver the export to the patient via a **secure, encrypted channel** (not plain email)
5. Log the export in your compliance records (date, requester, data scope, delivery method)

**Time estimate:** 15–30 minutes including identity verification

---

## Operational Exports (admin/reporting)

### Export Appointments

```bash
TOKEN="<admin-jwt>"

# Export all appointments in date range (CSV)
curl -X GET "https://health-watchers.app/api/v2/appointments/export?from=2026-01-01&to=2026-08-30&format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o appointments_export.csv

# Export as Excel
curl -X GET "https://health-watchers.app/api/v2/appointments/export?format=xlsx" \
  -H "Authorization: Bearer $TOKEN" \
  -o appointments_export.xlsx
```

### Export Payment History

```bash
TOKEN="<admin-jwt>"

curl -X GET "https://health-watchers.app/api/v2/payments/export?from=2026-01-01&to=2026-08-30&format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o payments_export.csv
```

---

## Audit Log Export (Compliance)

Audit logs are encrypted at rest (`AUDIT_ENCRYPTION_KEY`). The export endpoint decrypts and returns them in a readable format.

```bash
TOKEN="<admin-jwt>"

# Export audit logs for a date range
curl -X GET "https://health-watchers.app/api/v2/audit/export?from=2026-01-01&to=2026-08-30&format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o audit_export_2026.csv
```

**Retention policy:**
- Audit logs: minimum 6 years (HIPAA § 164.312(b)), configurable via `AUDIT_LOG_RETENTION_YEARS`
- Clinical records: minimum 6 years, configurable via `CLINICAL_RETENTION_YEARS` (default: 7)

---

## Full Database Export (mongodump)

Use for disaster recovery prep, environment migrations, or regulatory holds.

> **HIPAA:** A full database export contains PHI. Treat the export with the same controls as the production database. Encrypt immediately, restrict access, and securely delete when no longer needed.

```bash
# 1. Set variables
MONGO_URI="mongodb+srv://<user>:<pass>@<host>/health_watchers"
EXPORT_DIR="/tmp/db_export_$(date +%Y%m%d_%H%M%S)"
ENCRYPTION_KEY="<BACKUP_ENCRYPTION_KEY>"

# 2. Dump the database
mongodump --uri="$MONGO_URI" --out="$EXPORT_DIR" --gzip

# 3. Archive
tar -czf "${EXPORT_DIR}.tar.gz" -C /tmp "$(basename $EXPORT_DIR)"

# 4. Encrypt (required for PHI — HIPAA § 164.312(c)(1))
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "${EXPORT_DIR}.tar.gz" \
  -out "${EXPORT_DIR}.tar.gz.enc" \
  -k "$ENCRYPTION_KEY"

# 5. Verify the encrypted file exists and is non-zero
ls -lh "${EXPORT_DIR}.tar.gz.enc"

# 6. Securely delete unencrypted files
shred -u "${EXPORT_DIR}.tar.gz"
rm -rf "$EXPORT_DIR"

echo "Export ready: ${EXPORT_DIR}.tar.gz.enc"
```

**Time estimate:** 15–60 minutes depending on database size

---

## Selective Collection Export

Export a specific MongoDB collection (e.g. for a legal hold on patient records):

```bash
MONGO_URI="mongodb+srv://<user>:<pass>@<host>/health_watchers"
COLLECTION="patients"  # or appointments, payments, auditlogs, etc.
OUTPUT_FILE="${COLLECTION}_export_$(date +%Y%m%d).json"

mongoexport \
  --uri="$MONGO_URI" \
  --collection="$COLLECTION" \
  --out="$OUTPUT_FILE" \
  --jsonArray

# Encrypt before sharing
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
  -in "$OUTPUT_FILE" \
  -out "${OUTPUT_FILE}.enc" \
  -k "$ENCRYPTION_KEY"

shred -u "$OUTPUT_FILE"
```

---

## Anonymised Export (for analytics / research)

When exporting data for non-clinical purposes (analytics, research), use the anonymisation package:

```bash
# The @health-watchers/anonymize package is available in the monorepo
# Use it to strip/mask PHI fields before export

# Via the API (if an anonymised export endpoint exists)
curl -X GET "https://health-watchers.app/api/v2/analytics/export?anonymised=true&format=csv" \
  -H "Authorization: Bearer $TOKEN" \
  -o anonymised_export.csv
```

---

## Large Export Handling

For exports larger than 100MB:
1. Run the export off-hours (02:00–06:00 UTC) to avoid peak load
2. Use streaming exports where possible — the API streams CSV/Excel to avoid memory pressure
3. Upload directly to S3 rather than downloading locally:
   ```bash
   mongodump --uri="$MONGO_URI" --archive --gzip | \
     aws s3 cp - "s3://$BACKUP_BUCKET/exports/export_$(date +%Y%m%d).archive.gz"
   ```

---

## Export Checklist

Before any PHI export:
- [ ] Confirm requester identity and authorisation
- [ ] Confirm minimum necessary data scope (HIPAA minimum necessary standard)
- [ ] Export will be encrypted in transit and at rest
- [ ] Export will be delivered via a secure channel
- [ ] Audit entry will be created (automatic via API; manual if using direct DB)
- [ ] Export files will be securely deleted after delivery

---

## Related Runbooks

- [Backup Procedures](./05-backup.md)
- [User Management Procedures](./09-user-management.md)
- [Database Maintenance](./10-database-maintenance.md)
