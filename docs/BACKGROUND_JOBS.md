# Background Jobs Catalogue

Every scheduled background job in the API: what it does, when it runs, what it
touches, and how to turn it off.

**Last Updated:** 2026-10-17

---

## Contents

- [How scheduling works](#how-scheduling-works)
- [Configuration](#configuration)
- [Observability](#observability)
- [Job summary](#job-summary)
- [Jobs](#jobs)
  - [payment-expiration](#payment-expiration)
  - [reconciliation](#reconciliation)
  - [balance-monitoring](#balance-monitoring)
  - [claimable-expiry-notification](#claimable-expiry-notification)
  - [xlm-rate](#xlm-rate)
  - [appointment-reminder](#appointment-reminder)
  - [waitlist-expiry](#waitlist-expiry)
  - [follow-up-reminder](#follow-up-reminder)
  - [risk-recalculation](#risk-recalculation)
  - [immunization-compliance](#immunization-compliance)
  - [mfa-grace-period](#mfa-grace-period)
  - [api-key-lifecycle](#api-key-lifecycle)
  - [notification-dispatch](#notification-dispatch)
  - [report-schedule](#report-schedule)
  - [webhook-retry](#webhook-retry)
  - [document-retention](#document-retention)
  - [outbox-relay](#outbox-relay)
- [Unscheduled job code](#unscheduled-job-code)
- [General troubleshooting](#general-troubleshooting)

---

## How scheduling works

All jobs are registered in `apps/api/src/jobs/index.ts` (`JOB_DEFINITIONS`) and
run through the distributed `JobRegistry` (`apps/api/src/jobs/job-registry.ts`, #1433).

- Each job is a BullMQ Job Scheduler on the `scheduled-jobs` queue in Redis.
- `upsertJobScheduler` is idempotent per job name, and every tick becomes one
  BullMQ job with a deterministic id. Running N API replicas still gives **one
  execution per tick across the whole fleet**.
- All cron patterns are evaluated in **UTC**. A 6-field pattern includes seconds.
- Each run is tried once (`attempts: 1`). A failed tick is not retried; the next
  tick runs on schedule.
- Run stats (last run, duration, status, error, success/failure counts) are
  written to the Redis hash `hw:jobs:stats:<job-name>`, so every replica reports the same values.
- The scheduler does not start when `NODE_ENV=test` unless `JOBS_ENABLED=true`.

## Configuration

`<NAME>` is the job name upper-snake-cased (`payment-expiration` → `PAYMENT_EXPIRATION`).

| Variable                     | Default                  | Effect                                                                                                   |
| ---------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `JOB_<NAME>_CRON`            | job default              | Overrides the cron pattern (UTC), e.g. `JOB_XLM_RATE_CRON="*/10 * * * *"`                                 |
| `JOB_<NAME>_ENABLED`         | `true`                   | `false`, `0`, `no` or `off` disables the job. Its scheduler is **removed from Redis** on the next start |
| `JOBS_ENABLED`               | `true`                   | `false` stops this process from starting the scheduler or a worker (other replicas keep running jobs)   |
| `JOBS_WORKER_CONCURRENCY`    | `5`                      | How many different jobs one process may run at the same time                                              |
| `REDIS_URL`                  | `redis://localhost:6379` | Redis used by BullMQ and for job stats                                                                    |

> Disabling a job is fleet-wide: when any replica starts with
> `JOB_<NAME>_ENABLED=false`, that replica removes the shared scheduler. Set the
> same value on every replica, or a replica that still has it enabled will re-create it on restart.

To run jobs only on dedicated worker pods, set `JOBS_ENABLED=false` on the
API-serving deployment and leave it unset on the worker deployment.

## Observability

**Admin endpoint:** `GET /api/v1/admin/jobs` (`SUPER_ADMIN` only) returns every
job with its effective cron, enabled flag, last run/finish time, duration, last
status, last error, success/failure counts and next run time.

**Prometheus metrics (all jobs):**

| Metric                                        | Type      | Labels          |
| --------------------------------------------- | --------- | --------------- |
| `scheduled_job_runs_total`                    | counter   | `job`, `status` |
| `scheduled_job_failures_total`                | counter   | `job`           |
| `scheduled_job_duration_seconds`              | histogram | `job`, `status` |
| `scheduled_job_last_success_timestamp_seconds`| gauge     | `job`           |

Job-specific metrics are listed under each job below.

> A job "succeeds" from the registry's point of view when its handler resolves.
> Several handlers catch their own errors and log them (noted per job), so a
> green `lastStatus` does not always mean every item was processed. Check the
> logs for the job's log prefix as well.

---

## Job summary

| Job                                                             | Default schedule (UTC)  | File                                                                    |
| --------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| [payment-expiration](#payment-expiration)                       | every 5 min             | `modules/payments/services/payment-expiration-job.ts`                   |
| [reconciliation](#reconciliation)                               | hourly, :00             | `modules/payments/services/reconciliation-job.ts`                       |
| [balance-monitoring](#balance-monitoring)                       | every 15 min            | `modules/payments/services/balance-monitoring-job.ts`                   |
| [claimable-expiry-notification](#claimable-expiry-notification) | hourly, :00             | `modules/payments/services/claimable-expiry-notification-job.ts`        |
| [xlm-rate](#xlm-rate)                                           | every 5 min             | `modules/payments/services/xlm-rate-job.ts`                             |
| [appointment-reminder](#appointment-reminder)                   | every 15 min            | `modules/appointments/appointment-reminder-job.ts`                      |
| [waitlist-expiry](#waitlist-expiry)                             | every 15 min            | `modules/appointments/waitlist-expiry-job.ts`                           |
| [follow-up-reminder](#follow-up-reminder)                       | daily 08:00             | `modules/encounters/follow-up-reminder-job.ts`                          |
| [risk-recalculation](#risk-recalculation)                       | Sundays 03:00           | `modules/patients/risk-recalculation-job.ts`                            |
| [immunization-compliance](#immunization-compliance)             | daily 02:00             | `modules/immunizations/immunization-compliance-job.ts`                  |
| [mfa-grace-period](#mfa-grace-period)                           | daily 00:00             | `modules/auth/mfa-grace-period-job.ts`                                  |
| [api-key-lifecycle](#api-key-lifecycle)                         | hourly, :00             | `modules/api-keys/api-key-lifecycle-job.ts`                             |
| [notification-dispatch](#notification-dispatch)                 | every 30 s              | `modules/notifications/notification-dispatch-job.ts`                    |
| [report-schedule](#report-schedule)                             | every minute            | `modules/reports/analytics/report-schedule-job.ts`                      |
| [webhook-retry](#webhook-retry)                                 | every 30 s              | `modules/webhooks/retry-worker.ts`                                      |
| [document-retention](#document-retention)                       | every 6 h, :00          | `modules/documents/document-retention.service.ts`                       |
| [outbox-relay](#outbox-relay)                                   | every 5 s               | `modules/outbox/outbox.relay.ts`                                        |

All paths are relative to `apps/api/src/`.

---

## Jobs

### payment-expiration

| Field             | Value                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File              | `modules/payments/services/payment-expiration-job.ts` (`runExpirationJobTick`)                                                                                                                       |
| Schedule          | `*/5 * * * *`                                                                                                                                                                                         |
| Purpose           | Marks `PaymentRecord`s with `status: 'pending'` and `expiresAt` in the past as `failed`. `calculateExpiryDate()` gives 24 h for immediate and multisig payments and 30 days for escrow                |
| Side effects      | DB writes only (`paymentrecords.status`). No emails, notifications or Stellar calls                                                                                                                  |
| Env toggles       | `JOB_PAYMENT_EXPIRATION_ENABLED`, `JOB_PAYMENT_EXPIRATION_CRON`                                                                                                                                       |
| Idempotency       | Single `updateMany` filtered on `status: 'pending'`. Re-running is a no-op. Transient Mongo errors (network/topology/server-selection, `ECONNREFUSED`, `ENOTFOUND`, `ETIMEOUT`) are retried 3 times with 1 s → 2 s → 4 s backoff |
| Error handling    | Swallows all errors so the tick always "succeeds" in the registry. Failures show in the job metrics below                                                                                              |
| Metrics           | `payment_expiration_job_errors_total`, `payment_expiration_job_last_run_expired`, `payment_expiration_job_last_success_timestamp_seconds`, `payment_expiration_job_consecutive_failures`              |
| Status endpoint   | `getClusterJobStatus()` (used by the health/jobs check) merges this pod's state with the cluster-wide last success from Redis                                                                         |

**Troubleshooting**

- *Payments stay `pending` long after expiry:* check `payment_expiration_job_consecutive_failures`
  and logs for `[payment-expiration-job] tick failed`. Usually MongoDB is unreachable.
- *Payments never expire at all:* records created without `expiresAt` are not matched.
  Check that the intent's code path sets `expiresAt`. Those records are only cleaned up by
  [reconciliation](#reconciliation) after 24 h.
- *Users report payments failing early:* confirm the server clock and that `expiresAt` was set in UTC.

### reconciliation

| Field          | Value                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/payments/services/reconciliation-job.ts` (`reconcileStalePending`)                                                                                                                     |
| Schedule       | `0 * * * *`                                                                                                                                                                                     |
| Purpose        | For `pending` payments older than 24 h that have a `txHash`, asks Horizon (through stellar-service `GET /verify/:hash`) whether the transaction succeeded and sets `confirmed` or `failed`. Stale pending records **without** a `txHash` are set to `failed` |
| Side effects   | DB writes. One stellar-service/Horizon call per stale record. Does **not** run the confirmation side effects (emails, outbox, invoices); it only updates the status field             |
| Env toggles    | `JOB_RECONCILIATION_ENABLED`, `JOB_RECONCILIATION_CRON`                                                                                                                                         |
| Idempotency    | Only touches `pending` records, so a record is reconciled once. A Horizon error on one record is logged and that record is retried next hour                                                    |

**Troubleshooting**

- *`Failed to verify stale payment` warnings:* stellar-service or Horizon is unavailable, or its
  circuit breaker is open. Check `GET <stellar-service>/health`.
- *A paid invoice shows as unpaid after reconciliation confirmed the payment:* this job doesn't
  update invoices or send receipts. Re-run the confirmation through `PATCH /payments/:intentId/confirm`
  or the stellar-service webhook path.

### balance-monitoring

| Field          | Value                                                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/payments/services/balance-monitoring-job.ts` (`runBalanceMonitoring`)                                                                                                                                                                                |
| Schedule       | `*/15 * * * *`                                                                                                                                                                                                                                                |
| Purpose        | For every active clinic with a `stellarPublicKey`: fetch the balance and recent transactions, upsert a daily `BalanceSnapshot`, raise low/critical balance alerts, and flag large or unrecognized incoming transactions                                     |
| Side effects   | **Emails** to the clinic's `CLINIC_ADMIN` (low balance, critical balance, large transaction, unrecognized transaction). In-app notifications (`balance_low_warning`, `balance_critical`, `large_transaction`, `unrecognized_transaction`). Socket.IO `balance:low_warning` / `balance:critical` to the clinic room. Prometheus gauge `clinic_xlm_balance` |
| Env toggles    | `JOB_BALANCE_MONITORING_ENABLED`, `JOB_BALANCE_MONITORING_CRON`, `BALANCE_LOW_THRESHOLD` and `BALANCE_CRITICAL_THRESHOLD` (XLM, override per-clinic settings). Per clinic: `ClinicSettings.balanceAlerts` (`alertsEnabled`, `lowBalanceWarningXlm` = 100, `criticalBalanceXlm` = 10, `largeTransactionXlm` = 1000) |
| Idempotency    | The snapshot is an upsert keyed on `(clinicId, UTC date)`. **Alerts are not de-duplicated**: while a balance stays below a threshold, the admin gets an email and notification every run (every 15 min). Large/unrecognized transaction alerts repeat for as long as the transaction is in the recent-transactions window |

**Troubleshooting**

- *Admins flooded with low-balance emails:* fund the account, raise the threshold via
  `ClinicSettings.balanceAlerts`, set `alertsEnabled: false` for that clinic, or slow the job
  (`JOB_BALANCE_MONITORING_CRON="0 * * * *"`).
- *No alerts at all:* the clinic needs an active `CLINIC_ADMIN` user. Snapshots are still written without one.
- *`Failed to fetch balance for monitoring`:* stellar-service `GET /balance/:publicKey` failed.
  Check `STELLAR_SERVICE_SECRET` and stellar-service health.

### claimable-expiry-notification

| Field          | Value                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/payments/services/claimable-expiry-notification-job.ts` (`sendClaimableExpiryNotifications`)                                                                                         |
| Schedule       | `0 * * * *`                                                                                                                                                                                   |
| Purpose        | Notifies patients whose unclaimed claimable balance (`claimableUntil`) expires within 24 h                                                                                                   |
| Side effects   | **Email** to the patient. In-app notification `claimable_expiring`. Socket.IO `payment:claimable_expiring` to the patient's user room                                                         |
| Env toggles    | `JOB_CLAIMABLE_EXPIRY_NOTIFICATION_ENABLED`, `JOB_CLAIMABLE_EXPIRY_NOTIFICATION_CRON`                                                                                                         |
| Idempotency    | Sets `claimableExpiryNotificationSent: true` after notifying, so each record is notified once. If the process dies between sending and setting the flag, the patient may get a second email |

**Troubleshooting**

- *Patient never notified:* the record needs a `patientId` that resolves to a `User`. Records without
  one are skipped silently. Check `GET /payments/expiring-claimable`.
- *Need to re-send:* unset `claimableExpiryNotificationSent` on the record. It is picked up on the next hourly run.

### xlm-rate

| Field          | Value                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/payments/services/xlm-rate-job.ts` (`runRateJobTick`)                                                                                                              |
| Schedule       | `*/5 * * * *`                                                                                                                                                               |
| Purpose        | Fetches XLM/USD (CoinGecko, then Stellar Expert as fallback), caches it in Redis for 5 min and stores it in `xlmrates` history                                               |
| Side effects   | Outbound HTTP to the rate sources. Redis and DB writes. No user-facing messages                                                                                             |
| Env toggles    | `JOB_XLM_RATE_ENABLED`, `JOB_XLM_RATE_CRON`                                                                                                                                 |
| Idempotency    | Each run overwrites the cache and adds one history row. Safe to re-run                                                                                                      |
| Error handling | Swallows errors. After 15 min without a good fetch the rate counts as stale and an `xlm_rate_stale` warning is logged                                                         |
| Metrics        | `xlm_rate_fetch_errors_total`, `xlm_rate_last_value_usd`, `xlm_rate_last_fetch_timestamp_seconds`, `xlm_rate_stale`                                                                  |

**Troubleshooting**

- *`xlm_rate_stale = 1`:* both sources failed for 15 min or more. Check egress to `api.coingecko.com` and
  `api.stellar.expert`, and CoinGecko rate limiting. Payment confirmations still work; `usdEquivalent`
  uses the last cached rate, or `0` if none is available.
- *USD amounts look wrong:* compare `xlm_rate_last_value_usd` with a public quote.

### appointment-reminder

| Field          | Value                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/appointments/appointment-reminder-job.ts` (`sendAppointmentReminders`)                                                                                                                                  |
| Schedule       | `*/15 * * * *`                                                                                                                                                                                                   |
| Purpose        | Sends a 24 h reminder (appointments starting in the next 24 h) and a 1 h reminder (appointments starting 55–60 min from now) for `scheduled` / `confirmed` appointments                                         |
| Side effects   | **Emails** to the doctor and patient. In-app notification `appointment_reminder`. Socket.IO `appointment:reminder` to both user rooms. Respects `preferences.notificationTypes.appointment_reminder === false` |
| Env toggles    | `JOB_APPOINTMENT_REMINDER_ENABLED`, `JOB_APPOINTMENT_REMINDER_CRON`                                                                                                                                              |
| Idempotency    | `reminderSent24h` / `reminderSent1h` are set after each send, so each reminder goes out once. A crash between send and flag update can cause a duplicate                                                      |
| Error handling | One try/catch around the whole run: an error on one appointment stops the rest of that run, and the tick still reports success                                                                                  |

**Troubleshooting**

- *1 h reminders missed:* the 1 h window is only 5 min wide but the job runs every 15 min, so an
  appointment can fall between two runs. If you change the cron, keep it at 5 min or less for reliable 1 h reminders.
- *No reminders at all:* look for `Error in appointment reminder job` in the logs. One bad record
  (for example a deleted patient) aborts the run.

### waitlist-expiry

| Field          | Value                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/appointments/waitlist-expiry-job.ts` (`expireWaitlistEntries`)                                                                                                       |
| Schedule       | `*/15 * * * *`                                                                                                                                                                |
| Purpose        | Expires `notified` waitlist entries whose 48 h response window (`expiresAt`) has passed, then offers the slot to the next patient on that doctor's waitlist                  |
| Side effects   | DB writes. `notifyNextOnWaitlist` sends the next patient a notification/email                                                                                                 |
| Env toggles    | `JOB_WAITLIST_EXPIRY_ENABLED`, `JOB_WAITLIST_EXPIRY_CRON`                                                                                                                     |
| Idempotency    | Entries move `notified` → `expired` once. Notifying the next patient is best-effort; errors are swallowed                                                                    |

**Troubleshooting**

- *Next patient not offered the slot:* the job needs an upcoming `scheduled`/`confirmed` appointment
  for the same clinic and doctor to use as context. With none, entries are expired but nobody is notified.

### follow-up-reminder

| Field          | Value                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/encounters/follow-up-reminder-job.ts` (`sendFollowUpReminders`)                                                                                                        |
| Schedule       | `0 8 * * *`                                                                                                                                                                     |
| Purpose        | For encounters with `followUpRequired: true`, `followUpCompleted: false` and `followUpDate` tomorrow, notifies the attending doctor and emails the patient                     |
| Side effects   | In-app notification `follow_up_reminder` (doctor). **Email** through the email queue (patient), unless `preferences.emailNotifications` or `notificationTypes.follow_up_reminder` is `false` |
| Env toggles    | `JOB_FOLLOW_UP_REMINDER_ENABLED`, `JOB_FOLLOW_UP_REMINDER_CRON`                                                                                                                 |
| Idempotency    | **No sent flag.** Running it twice on the same day sends duplicates. Don't trigger it manually after the 08:00 run                                                             |

**Troubleshooting**

- *Reminders a day off:* "tomorrow" uses the process's local time zone. Containers normally run in
  UTC, so tomorrow means the next UTC day.
- *Patient got no email:* the patient needs a `User` with `role: 'PATIENT'` linked through `patientId`.

### risk-recalculation

| Field          | Value                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/patients/risk-recalculation-job.ts` (`runRiskRecalculation`)                                                                                                                                       |
| Schedule       | `0 3 * * 0` (Sundays)                                                                                                                                                                                       |
| Purpose        | Recomputes `riskScore` / `riskLevel` / `riskFactors` for every active patient from recent encounters, lab results and no-shows (batches of 100). Appends a `RiskScoreHistory` row (`source: 'scheduled'`) |
| Side effects   | DB writes. In-app notification `high_risk_patient` to every active `CLINIC_ADMIN` when a patient escalates to `high` or `critical`                                                                        |
| Env toggles    | `JOB_RISK_RECALCULATION_ENABLED`, `JOB_RISK_RECALCULATION_CRON`                                                                                                                                             |
| Idempotency    | Patient fields are overwritten (safe). Each run adds one history row per patient. Escalation alerts only fire when the level goes **up**, so a re-run on the same data sends no new alerts               |

**Troubleshooting**

- *Long runtime / DB load:* runs several queries per patient (encounters, lab results, no-shows, update, history insert). Watch `scheduled_job_duration_seconds{job="risk-recalculation"}`
  and move the cron to a quieter window if needed.
- *Some patients skipped:* look for `Risk recalculation failed for patient`. The batch-progress log line shows the `errors` count.

### immunization-compliance

| Field          | Value                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/immunizations/immunization-compliance-job.ts` (`runImmunizationComplianceJob`)                                                       |
| Schedule       | `0 2 * * *`                                                                                                                                   |
| Purpose        | For every active clinic, finds patients with overdue immunizations and notifies the attending doctor                                         |
| Side effects   | In-app notifications (`IMMUNIZATION_OVERDUE`), written straight to `NotificationModel` (no Socket.IO event, no email)                         |
| Env toggles    | `JOB_IMMUNIZATION_COMPLIANCE_ENABLED`, `JOB_IMMUNIZATION_COMPLIANCE_CRON`                                                                     |
| Idempotency    | **Not de-duplicated:** an immunization that stays overdue creates a new notification every day                                                |
| Error handling | Per-clinic errors are caught and logged inside the service (`Immunization compliance job failed`)                                            |

**Troubleshooting**

- *Doctors complain about daily repeats:* expected with the current code. Disable the job or move it to weekly
  (`JOB_IMMUNIZATION_COMPLIANCE_CRON="0 2 * * 1"`).

### mfa-grace-period

| Field          | Value                                                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/auth/mfa-grace-period-job.ts` (`runMfaGracePeriodReminderTick`)                                                                                               |
| Schedule       | `0 0 * * *`                                                                                                                                                            |
| Purpose        | Emails `DOCTOR` / `NURSE` users without MFA whose `mfaGracePeriodEndsAt` is 3 days or 1 day away                                                                      |
| Side effects   | **Email** (`sendMfaGracePeriodReminderEmail`)                                                                                                                          |
| Env toggles    | `JOB_MFA_GRACE_PERIOD_ENABLED`, `JOB_MFA_GRACE_PERIOD_CRON`                                                                                                            |
| Idempotency    | Uses a **1-hour** window ending exactly 3 d / 1 d from the run time. With the daily cron, a user is matched only if their deadline falls in the 23:00–00:00 UTC hour  |

**Troubleshooting**

- *Most users never get reminded:* this is the window/cron mismatch above. To cover every user, run it
  hourly (`JOB_MFA_GRACE_PERIOD_CRON="0 * * * *"`). The 1 h window then lines up with the tick, so
  each user still gets one email per threshold.

### api-key-lifecycle

| Field          | Value                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/api-keys/api-key-lifecycle-job.ts` (`sweepApiKeyLifecycle`)                                                                                                      |
| Schedule       | `0 * * * *`                                                                                                                                                               |
| Purpose        | 1) Deactivates keys past `expiresAt`. 2) Clears `previousKeyHash` once the rotation grace window closes. 3) Sends a one-time "expiring soon" warning 7 days before expiry |
| Side effects   | DB writes. In-app notification (`system`) to the key's creator                                                                                                           |
| Env toggles    | `JOB_API_KEY_LIFECYCLE_ENABLED`, `JOB_API_KEY_LIFECYCLE_CRON`                                                                                                             |
| Idempotency    | Every step is idempotent. The warning is guarded by `expiryWarningSentAt`                                                                                                 |

**Troubleshooting**

- *Integration broke right after rotation:* the old key stops working when `previousKeyExpiresAt` passes.
  The API key middleware rejects the old key (`This API key was rotated and the grace period has ended`) as soon as the time passes; the job only clears the stored hash afterwards.

### notification-dispatch

| Field          | Value                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/notifications/notification-dispatch-job.ts` (`processDueDeliveries`)                                                                                 |
| Schedule       | `*/30 * * * * *` (every 30 s)                                                                                                                                 |
| Purpose        | Delivers `NotificationDelivery` rows that are due: scheduled deliveries past `scheduledFor`, failed deliveries past `nextRetryAt`, and never-attempted rows (up to 200 per tick, oldest first) |
| Side effects   | Delivery over the row's channel (`in_app`, `email`, `sms` or `push`) through `notification-dispatch.service`. In-app deliveries also emit Socket.IO `notification:new` |
| Env toggles    | `JOB_NOTIFICATION_DISPATCH_ENABLED`, `JOB_NOTIFICATION_DISPATCH_CRON`                                                                                         |
| Idempotency    | `attemptDelivery` moves each row out of `pending` (or reschedules it with backoff). One BullMQ execution per tick means rows are not processed twice at once |
| Metrics        | `notification_retry_queue_depth` (pending rows)                                                                                                               |

**Troubleshooting**

- *Queue depth keeps growing:* the channel provider (SMTP, SMS, push) is failing. Check `[notification-dispatch-job]` logs and the row's `lastError`.

### report-schedule

| Field          | Value                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/reports/analytics/report-schedule-job.ts` (`processDueReportSchedules`)                                                                              |
| Schedule       | `* * * * *`                                                                                                                                                   |
| Purpose        | Runs up to 20 due `ReportSchedule`s per tick over their rolling window, records a `ReportRun` and notifies recipients                                        |
| Side effects   | Analytics queries (can be heavy). In-app notification `report_ready` to each recipient                                                                       |
| Env toggles    | `JOB_REPORT_SCHEDULE_ENABLED`, `JOB_REPORT_SCHEDULE_CRON`. Per schedule: `isActive`                                                                           |
| Idempotency    | Each schedule is claimed with an atomic `findOneAndUpdate` on `(_id, nextRunAt)` that moves `nextRunAt` forward, so a schedule is never run twice for one slot |

**Troubleshooting**

- *Report never arrives:* check `reportruns` for an `error` row. `Unknown template "<id>"` means the schedule points to a removed template.
- *Backlog after downtime:* each overdue schedule runs once (not once per missed slot), up to 20 per minute.

### webhook-retry

| Field          | Value                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/webhooks/retry-worker.ts` (`processDueWebhookRetries`)                                                                                                               |
| Schedule       | `*/30 * * * * *` (every 30 s)                                                                                                                                                 |
| Purpose        | Re-attempts up to 50 `pending` outbound webhook deliveries whose `nextRetryAt` has passed. Deliveries past `retryConfig.maxRetries` move to `dead`                            |
| Side effects   | **Outbound HTTP POSTs to third-party endpoints**, signed with each webhook's secret. See the [Webhook Consumer Guide](./WEBHOOK_CONSUMER_GUIDE.md)                          |
| Env toggles    | `JOB_WEBHOOK_RETRY_ENABLED`, `JOB_WEBHOOK_RETRY_CRON`                                                                                                                         |
| Idempotency    | Already-`delivered` deliveries are skipped. The POST is not idempotent on the receiver side; consumers must de-duplicate on `X-Webhook-Event-Id` / `X-Webhook-Id`        |
| Note           | Retries are started fire-and-forget, so the tick returns before the POSTs finish                                                                                             |

**Troubleshooting**

- *Deliveries stuck in `pending`:* the job may be disabled, or the delivery has no `nextRetryAt`.
  Manually retry with `POST /webhooks/:id/deliveries/:deliveryId/retry`.
- *Many `dead` deliveries with `Blocked URL`:* the receiver URL fails SSRF validation (private/loopback hosts such as `localhost`, or non-HTTPS URLs when `NODE_ENV=production`).

### document-retention

| Field          | Value                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/documents/document-retention.service.ts` (`runRetentionSweep`)                                                                                                 |
| Schedule       | `0 */6 * * *`                                                                                                                                                           |
| Purpose        | Expires or archives documents past `expiresAt` according to their retention policy, then purges stored files once `purgeAfterDays` has passed for `purge` policies |
| Side effects   | **Deletes files from object storage** (document and preview). DB status changes. Document audit entries (`expired`, `archived`, `purged`)                              |
| Env toggles    | `JOB_DOCUMENT_RETENTION_ENABLED`, `JOB_DOCUMENT_RETENTION_CRON`                                                                                                         |
| Idempotency    | Status-filtered and safe to re-run. Documents under `legalHold` are never touched. If storage deletion fails, it is logged and the document is still marked `deleted` |

**Troubleshooting**

- *Need to stop a purge immediately:* set `legalHold: true` on the policy, or disable the job with `JOB_DOCUMENT_RETENTION_ENABLED=false`. Purged bytes cannot be recovered from storage; restore from backup.
- *`retention purge: storage delete failed`:* orphaned objects remain in the bucket. Clean them up using the `storageKey` from the log entry.

### outbox-relay

| Field          | Value                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File           | `modules/outbox/outbox.relay.ts` (`relayPendingOutboxEvents`)                                                                                                                           |
| Schedule       | `*/5 * * * * *` (every 5 s)                                                                                                                                                             |
| Purpose        | Safety net for the transactional outbox (#1432): delivers up to 100 due `pending` outbox events that the post-commit fast path missed                                                  |
| Side effects   | Webhook dispatch, in-app notifications and Socket.IO emits, per event target (e.g. `payment.confirmed`, `encounter.created`, appointment status changes)                              |
| Env toggles    | `JOB_OUTBOX_RELAY_ENABLED`, `JOB_OUTBOX_RELAY_CRON`                                                                                                                                     |
| Idempotency    | At-least-once delivery. Each event is claimed with a 60 s lease. Delivered targets are recorded so a retry only re-sends the failed ones. Webhook deliveries are de-duplicated per `(eventId, webhookId)`. Backoff 5 s → 10 s → … capped at 10 min; abandoned (`failed`) after 10 attempts |
| Metrics        | `outbox_lag_seconds`, `outbox_pending_events`, `outbox_delivery_failures_total`, `outbox_events_delivered_total`, `outbox_events_dead_total`, `outbox_delivery_latency_seconds`        |

**Troubleshooting**

- *`outbox_lag_seconds` climbing:* the relay is disabled, Redis/BullMQ is down, or one target keeps failing. Check `lastError` on the oldest `pending` event.
- *Socket events from the relay never reach clients:* events emitted by a worker-only process (no Socket.IO server) are dropped for `socket-service` targets. Make sure at least one API-serving replica runs jobs, or rely on the fast path.
- *Do not disable this job* unless you accept that webhooks, notifications and socket events lost by the fast path stay undelivered.

---

## Unscheduled job code

| File                                                 | Status                                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modules/payments/recurring-payment-scheduler.ts`    | `scheduleRecurringPaymentProcessor()` (daily `setInterval`) is **not called anywhere** and not registered with the JobRegistry, so recurring payment requests are not generated automatically. See [Recurring payments](../apps/docs/docs/stellar/payment-lifecycle.md#recurring-payments) |

---

## General troubleshooting

| Symptom                                           | Check                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| No job runs at all                                | `JOBS_ENABLED` on every replica, Redis reachability (`[job-registry] redis connection error`), `GET /admin/jobs` → `schedulerRunning`           |
| A job ran twice for one tick                      | Should not happen with BullMQ schedulers. Look for an old build that still uses `setInterval`, or a manual trigger                              |
| A disabled job keeps running                      | Another replica with the job enabled re-created the scheduler. Set `JOB_<NAME>_ENABLED=false` everywhere and restart                           |
| `nextRunAt` is `null` in `/admin/jobs`            | The job is disabled, or Redis could not be read (a 2 s read timeout applies)                                                                     |
| Need to run a job now                             | Temporarily set `JOB_<NAME>_CRON` to a near-future pattern, or call the exported handler from a one-off script. Check the job's idempotency notes first |

Related runbooks: [Monitoring Alerts](./runbooks/06-monitoring-alerts.md),
[Incident Response](./runbooks/03-incident-response.md), [Scaling](./runbooks/04-scaling.md).
