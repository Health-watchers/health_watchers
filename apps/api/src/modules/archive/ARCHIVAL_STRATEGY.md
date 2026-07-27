# Data Archival Strategy

## Overview

The Health Watchers platform implements a comprehensive data archival strategy to improve active database performance by moving old records to archival storage while maintaining compliance requirements and data recoverability.

## Architecture

### Archive Model

The `Archive` collection stores archived documents with the following key information:
- **originalCollectionName**: Name of the collection the document came from
- **originalDocumentId**: ID of the original document
- **archivedData**: Complete document snapshot
- **archiveReason**: Why the document was archived (age, retention_policy, manual, compliance)
- **archivedAt**: Timestamp when the document was archived
- **expiryDate**: When the archive itself expires
- **restoreMetadata**: Information about restoration capability and history

### Archival Policies

Each collection has a defined archival policy that specifies:
- **archiveAfterDays**: How long to keep documents in active storage
- **retentionDays**: How long to keep archives before permanent deletion
- **batchSize**: Number of documents to archive per operation
- **enabled**: Whether archival is enabled for this collection

Default policies:
- **Encounters**: Archive after 365 days, retain for 2555 days (7 years - compliance)
- **Communications**: Archive after 730 days, retain for 1825 days (5 years)
- **Audit Logs**: Archive after 365 days, retain for 2555 days (7 years - compliance)
- **Health Logs**: Archive after 1095 days, retain for 2555 days (7 years)

## Performance Benefits

1. **Reduced Active Database Size**: Old records are moved off to separate collections
2. **Faster Queries**: Indexes on active collections are smaller and queries run faster
3. **Improved Write Performance**: Reduced collection size means faster write operations
4. **Lower Memory Usage**: MongoDB stores less data in RAM

## Data Retrieval

### Archive Retrieval API

```
GET /api/archive/records?collectionName=encounters&limit=100&offset=0
```

Returns archived records with pagination support.

### Archive Restoration

```
POST /api/archive/restore
Body: { archiveId: "..." }
```

Restores an archived record back to its original collection. Only possible within the restoration window (typically 90 days from archival).

## Archive Management

### Archival Triggers

Archival can be triggered manually:
```
POST /api/archive/trigger
Body: { collectionName: "encounters" }
```

Or scheduled to run automatically via background jobs.

### Statistics

```
GET /api/archive/stats
```

Returns statistics on archived records by collection.

### Deletion of Expired Archives

```
POST /api/archive/delete-expired
```

Permanently deletes archives that have exceeded their retention period.

## Implementation Details

### Storage Strategy

Archives are stored in:
1. **Active Archives**: Recent archives that can be restored (first 90 days)
2. **Long-term Archives**: Older archives retained for compliance (years 1-7)
3. **Deleted Archives**: Permanent deletion after retention period

### Indexes

Optimized indexes ensure fast retrieval:
- `clinicId + originalCollectionName + archivedAt`: Browse archives by collection
- `clinicId + expiryDate`: Identify expiring archives
- `originalDocumentId + originalCollectionName`: Find specific archived documents

### Compliance

The archival system meets healthcare compliance requirements:
- **HIPAA**: 7-year retention for medical records
- **Audit Logs**: Full 7-year retention for compliance
- **Immutability**: Archives are write-once, read-many (append-only)
- **Audit Trail**: All restorations are logged

## Monitoring and Maintenance

### Archive Size Monitoring

Track archive collection size to ensure it doesn't grow unbounded:
```typescript
const stats = await archiveService.getArchiveStats(clinicId);
console.log(stats);
// {
//   total: 50000,
//   byCollection: [
//     { _id: 'encounters', count: 30000, oldestArchive: '2023-01-01', newestArchive: '2023-12-31' }
//   ]
// }
```

### Regular Cleanup

Run expired archive deletion regularly (monthly or quarterly):
```typescript
const deletedCount = await archiveService.deleteExpiredArchives(clinicId);
console.log(`Deleted ${deletedCount} expired archives`);
```

## Migration Recommendations

1. **Phase 1**: Deploy archival infrastructure (Week 1)
2. **Phase 2**: Enable archival for audit logs (low risk, highest compliance value)
3. **Phase 3**: Enable archival for encounters (high volume, significant performance benefit)
4. **Phase 4**: Enable archival for health logs and communications
5. **Phase 5**: Monitor and optimize batch sizes based on actual performance

## Future Enhancements

1. **Cold Storage Integration**: Archive to S3/Glacier for long-term retention
2. **Sharding by Archive Date**: Partition archives by date ranges for faster queries
3. **Compression**: Compress archived data to reduce storage costs
4. **Incremental Archival**: Archive only changed fields instead of full documents
5. **Archive Search**: Full-text search across archived documents
