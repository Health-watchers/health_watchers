# Data Migration Troubleshooting

Covers `migrate-mongo` usage, stuck migrations, rollbacks, index failures, schema changes, and the in-app migration manager.

---

## Table of Contents

- [Migration Setup](#migration-setup)
- [Checking Migration Status](#checking-migration-status)
- [Running Migrations](#running-migrations)
- [Stuck Migrations](#stuck-migrations)
- [Failed Migrations](#failed-migrations)
- [Rolling Back Migrations](#rolling-backs)
- [Index Migration Issues](#index-migration-issues)
- [Schema Change Issues](#schema-change-issues)
- [Migration Manager (In-App)](#migration-manager-in-app)
- [Creating New Migrations](#creating-new-migrations)
- [Migration Best Practices](#migration-best-practices)
- [Migration File Reference](#migration-file-reference)

---

## Migration Setup

The project uses [`migrate-mongo`](https://github.com/seppevs/migrate-mongo) configured in `migrate-mongo-config.js`.

```bash
# Install dependencies (from monorepo root)
npm install

# Configuration file
cat apps/api/migrate-mongo-config.js

# Required env var
echo $MONGO_URI
```

All migration commands must be run from `apps/api/`:

```bash
# Windows CMD
cd apps\api
set MONGO_URI=mongodb://localhost:27017/health_watchers

# Check status
npm run migrate:status

# Run pending migrations
npm run migrate:up

# Roll back the last migration
npm run migrate:down

# Create a new migration file
npm run migrate:create -- my-migration-name
```

---

## Checking Migration Status

```bash
npm run migrate:status
```

Output example:
```
┌──────────────────────────────────────────────────┬────────────┐
│ Filename                                         │ Applied At │
├──────────────────────────────────────────────────┼────────────┤
│ 20240101_initial_schema.ts                       │ 2024-01-01 │
│ 20240102_add_patient_search_index.ts             │ 2024-01-02 │
│ 20260825_compound_index_optimization.ts          │ PENDING    │
└──────────────────────────────────────────────────┴────────────┘
```

**Interpreting status:**

| Status | Meaning |
|---|---|
| Timestamp shown | Migration applied successfully |
| `PENDING` | Migration has not been run yet |
| Missing from list | Migration file not found — may be deleted or renamed |

---

## Running Migrations

### Standard migration run

```bash
# From apps/api/
npm run migrate:up
```

This runs all `PENDING` migrations in filename order (chronological by timestamp prefix).

### Verify after migration

```bash
# Confirm no pending migrations remain
npm run migrate:status

# Spot-check a specific index was created
mongosh "$MONGO_URI" --eval "
db.patients.getIndexes().forEach(i => print(i.name))
"
```

### Running in production / CI

Migrations should be run as a **pre-deployment step**, not inside `startServer()`. Use a Kubernetes Job or CI pipeline step:

```yaml
# Example GitHub Actions step
- name: Run DB migrations
  run: npm run migrate:up
  working-directory: apps/api
  env:
    MONGO_URI: ${{ secrets.MONGO_URI }}
```

Running migrations inside the app process risks running them multiple times on a multi-pod deploy.

---

## Stuck Migrations

### Symptom

`migrate:status` shows a migration as neither applied nor pending — or `migrate:up` hangs indefinitely.

### Cause

`migrate-mongo` uses a `changelog` collection in MongoDB to track applied migrations. If a migration process crashed mid-run, the entry may be in an inconsistent state (started but not completed).

### Diagnose

```javascript
// Check the changelog collection
mongosh "$MONGO_URI" --eval "
db.changelog.find().sort({ appliedAt: -1 }).limit(5).forEach(printjson)
"
```

Look for entries with a timestamp that matches a crashed run, or entries with `appliedAt: null`.

### Fix

```javascript
// Remove the stuck changelog entry
mongosh "$MONGO_URI" --eval "
db.changelog.deleteOne({ fileName: '20260825_compound_index_optimization.ts' })
"

// Then re-run
npm run migrate:up
```

If the migration had already partially applied (e.g., some indexes were created), the migration file itself must be idempotent — use `createIndex` with `{ background: true }` and handle `IndexAlreadyExists` gracefully.

---

## Failed Migrations

### Migration exits with an error

```bash
npm run migrate:up
# Error: MongoServerError: Index already exists with a different name
```

**The migration is NOT rolled back automatically.** You must fix the migration and re-run.

**Common failure causes:**

| Error | Cause | Fix |
|---|---|---|
| `Index already exists with a different name` | Index definition conflicts with existing index | Drop the conflicting index first (see below) |
| `MongoServerError: command createIndexes failed` | Insufficient MongoDB user permissions | Add `dbAdmin` role to the migration user |
| `ECONNREFUSED` | MongoDB not reachable | Fix `MONGO_URI` and DB connectivity |
| `Cannot read properties of undefined` | TypeScript config not loaded | Run with `NODE_OPTIONS="--require ts-node/register"` |
| `Duplicate key error on collection` | Data migration violating unique constraint | Clean duplicate data first |

### Fix index conflict

```javascript
// List all indexes to find the conflicting name
mongosh "$MONGO_URI" --eval "
db.patients.getIndexes().forEach(i => print(i.name, JSON.stringify(i.key)))
"

// Drop the old index
mongosh "$MONGO_URI" --eval "
db.patients.dropIndex('old_index_name_here')
"

// Re-run the migration
npm run migrate:up
```

### Fix data migration failures

If a migration transforms data and fails partway through, partial changes may already be applied.

**Strategy for idempotent data migrations:**

```typescript
// Good pattern — process in batches, skip already-processed records
export const up = async (db: Db) => {
  const cursor = db.collection('patients').find({ migratedAt: { $exists: false } });
  
  for await (const patient of cursor) {
    await db.collection('patients').updateOne(
      { _id: patient._id, migratedAt: { $exists: false } }, // guard
      {
        $set: { newField: transform(patient), migratedAt: new Date() }
      }
    );
  }
};
```

This allows the migration to be safely re-run after a partial failure.

---

## Rolling Back Migrations

```bash
# Roll back the last applied migration
npm run migrate:down
```

This calls the `down()` function of the most recently applied migration.

### Important: not all migrations are reversible

- **Index creation** is easily reversible: `dropIndex()` in `down()`.
- **Data transformations** may be irreversible if the original data was overwritten.
- **Schema changes** (adding required fields) may be irreversible if data was written in the new format.

Always implement `down()` for every migration, but be aware of its limitations.

### Rolling back multiple migrations

```bash
# Roll back the last N migrations by running down N times
npm run migrate:down  # rolls back 1
npm run migrate:down  # rolls back 1 more
```

### Rollback on production

Before rolling back in production:
1. Take a database backup first.
2. Coordinate with the team — a rollback typically requires deploying the previous code version simultaneously.
3. Test the rollback in staging first.

---

## Index Migration Issues

### Index build taking too long

Large collections (millions of documents) can take minutes to hours to build an index. On MongoDB 4.4+, background index builds are the default.

**Monitor index build progress:**
```javascript
mongosh "$MONGO_URI" --eval "
db.adminCommand({ currentOp: 1, 'command.createIndexes': { \$exists: true } })
"
// Shows: percentComplete, msg
```

**Options for large collections:**
1. Run the migration during a low-traffic window.
2. Build the index on secondaries first (rolling index build).
3. Use the `{ background: true }` option — builds without blocking reads/writes (note: already default on Atlas and MongoDB 4.4+).

### Index not appearing after migration

```bash
npm run migrate:status  # shows migration as applied

# But index not present?
mongosh "$MONGO_URI" --eval "db.patients.getIndexes()"
```

**Cause:** The migration's `up()` function succeeded but `createIndex()` failed silently (e.g., driver swallowed the error).

**Fix:** Add explicit error handling in migration files:
```typescript
export const up = async (db: Db) => {
  const result = await db.collection('patients').createIndex(
    { clinicId: 1, isActive: 1 },
    { name: 'clinicId_1_isActive_1' }
  );
  console.log('Index created:', result);
};
```

### Duplicate index names

MongoDB requires unique index names per collection.

```javascript
// List existing indexes with their names
db.patients.getIndexes().forEach(i => console.log(i.name, i.key))
```

If an index with the same key definition but a different name already exists:
```javascript
// Option A: drop and recreate with consistent name
db.patients.dropIndex('old_name');
// Then re-run migration

// Option B: use { name: 'desired_name' } in createIndex to be explicit
```

---

## Schema Change Issues

### Adding a required field to an existing collection

**Problem:** Adding `{ required: true }` to a Mongoose schema breaks reads on existing documents that lack the field.

**Safe approach:**
1. Add the field as optional initially.
2. Run a data migration to backfill the field.
3. Add the `required: true` constraint only after backfill completes.

**Backfill migration example:**
```typescript
export const up = async (db: Db) => {
  await db.collection('patients').updateMany(
    { emergencyContact: { $exists: false } },
    { $set: { emergencyContact: null } }
  );
};
```

See `20260425_add_emergency_contacts.ts` for a real example.

### Renaming a field

Never rename a field in a single deployment — existing documents still use the old name.

**Safe rename procedure:**
1. **Step 1:** Add the new field name, write to both old and new.
2. **Step 2:** Backfill: copy old → new for all existing documents.
3. **Step 3:** Remove the old field from reads (read only new).
4. **Step 4:** Drop the old field: `$unset: { oldField: "" }`.
5. **Step 5:** Remove the old field from writes.

### Removing a field

Fields should only be removed from the Mongoose schema **after** all code references to them are removed and deployed.

**Safe removal migration:**
```typescript
export const up = async (db: Db) => {
  await db.collection('patients').updateMany(
    {},
    { $unset: { deprecatedField: "" } }
  );
};
```

---

## Migration Manager (In-App)

The `migrationManager` service (`services/migration-manager.service.ts`) tracks migration status within the running app and exposes it via the API.

### Check migration status via API

```bash
curl -H "Authorization: Bearer <superAdminToken>" \
  http://localhost:4000/api/v2/migrations/status
```

### Migration manager initialization failure

```
[migration-manager] Initialization failed, continuing without migration tracking
```

This is non-fatal — the server continues. The `migrationManager` uses a separate tracking collection and cannot block startup.

**Diagnose:**
```bash
jq 'select(.msg | test("migration-manager"; "i"))' /var/log/api/app.log | tail -10
```

**Common cause:** MongoDB not fully ready when `migrationManager.initialize()` is called. It retries on the next request.

---

## Creating New Migrations

```bash
# From apps/api/
npm run migrate:create -- add-new-feature-indexes
# Creates: src/migrations/20260901T120000_add-new-feature-indexes.ts
```

### Migration file template

```typescript
import { Db } from 'mongodb';

export const up = async (db: Db): Promise<void> => {
  // Always use the driver directly (not Mongoose) in migrations
  // This avoids schema validation running against migration-time data

  await db.collection('collection_name').createIndex(
    { field1: 1, field2: -1 },
    { name: 'field1_1_field2_-1', background: true }
  );
};

export const down = async (db: Db): Promise<void> => {
  await db.collection('collection_name').dropIndex('field1_1_field2_-1');
};
```

---

## Migration Best Practices

### Always make migrations idempotent

Use `{ background: true }` for indexes (ignored if index already exists with same definition and name). For data migrations, add a guard condition:
```typescript
{ field: { $exists: false } }  // only update documents that need it
```

### Test migrations on a copy of production data

```bash
# Restore a backup to a test DB
mongorestore --uri="mongodb://localhost:27017/health_watchers_test" --dir=./backup

# Run migrations against the test DB
MONGO_URI=mongodb://localhost:27017/health_watchers_test npm run migrate:up
```

### Keep migrations small and focused

One migration file per concern. A migration that creates 10 indexes and transforms 3 collections is hard to debug and impossible to partially roll back.

### Never modify applied migrations

Once a migration has been applied to any environment, treat it as immutable. Create a new migration to fix issues.

### Include index names explicitly

```typescript
// Bad — MongoDB auto-generates a name that may differ across runs
db.collection('patients').createIndex({ clinicId: 1, isActive: 1 })

// Good — explicit name is predictable and safe to reference in down()
db.collection('patients').createIndex(
  { clinicId: 1, isActive: 1 },
  { name: 'clinicId_1_isActive_1' }
)
```

---

## Migration File Reference

All migrations are in `apps/api/src/migrations/`. Key files:

| File | What it does |
|---|---|
| `20240101_initial_schema.ts` | Base schema setup |
| `20240102_add_patient_search_index.ts` | Patient name search index |
| `20260425_audit_logs_ttl.ts` | TTL index for 6-year audit log retention |
| `20260425_patient_text_search_index.ts` | Full-text patient search |
| `20260527_hipaa_compliance_framework.ts` | HIPAA compliance indexes and fields |
| `20260624_add_mfa_grace_period.ts` | MFA grace period fields on user model |
| `20260625_dashboard_compound_indexes.ts` | Dashboard query optimization |
| `20260727_setup_sharding_infrastructure.ts` | Sharding zone tags and config |
| `20260825_compound_index_optimization.ts` | Latest compound index improvements |
| `20260825_patient_list_query_index.ts` | Index for clinic patient list cache warmup |
| `QUERY_OPTIMISATION.md` | Index strategy documentation — read before adding indexes |

---

## Emergency Procedures

### Migrate-mongo changelog is corrupt

```javascript
// View current changelog
mongosh "$MONGO_URI" --eval "db.changelog.find().forEach(printjson)"

// Back it up
mongosh "$MONGO_URI" --eval "
db.changelog.find().toArray()
" > changelog-backup.json

// Remove the corrupt entry and re-run
mongosh "$MONGO_URI" --eval "
db.changelog.deleteOne({ fileName: '<stuck_migration_filename>' })
"
npm run migrate:up
```

### Production data migration with zero downtime

For migrations that transform large datasets without downtime:

1. **Deploy code that handles both old and new schema** (dual-read/write).
2. **Run the migration** — backfills data at MongoDB speed, no app downtime.
3. **Verify migration** — check backfill completeness.
4. **Deploy code that uses only the new schema** — remove dual-read/write logic.
5. **Run cleanup migration** — remove old fields.

This is the expand-and-contract pattern. It's mandatory for any migration touching > 100k documents in production.
