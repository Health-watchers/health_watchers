# Notifications (multi-channel) — #1250

Delivers a single notification across **in-app, email, SMS and push** with
per-user preferences, templates, scheduling, delivery-status tracking and
automatic retries.

## Pieces

| File | Responsibility |
| --- | --- |
| `notification.model.ts` | In-app notification centre documents (existing) |
| `notification-template.model.ts` / `notification-template.service.ts` | Stored `{{var}}` templates, per channel + locale, with clinic overrides and a locale/scope fallback chain |
| `notification-delivery.model.ts` | One row per channel per notification — status, attempts, provider message id, retry schedule |
| `notification-preference.model.ts` / `notification-preference.service.ts` | Master switch, per-channel + per-type routing, quiet hours, digest. Legacy `user.preferences` flags are still honoured |
| `notification-channels.ts` | Pluggable provider adapters — SMTP (nodemailer), Twilio SMS, FCM push. `registerChannelAdapter()` swaps in a custom provider |
| `notification-dispatch.service.ts` | `dispatchNotification()` — resolves channels + recipients, renders templates, creates delivery rows, attempts immediate send, schedules retries (exponential backoff, cap 1h) |
| `notification-dispatch-job.ts` | Interval worker that releases scheduled deliveries and retries due failures |
| `notification-admin.controller.ts` | REST surface (mounted under `/api/v1/notifications`) |

## API

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET/PUT | `/notifications/preferences` | any user | Read / update own preferences |
| GET | `/notifications/deliveries` | any user | Paginated delivery log |
| GET | `/notifications/:id/deliveries` | any user | Delivery rows for one notification |
| GET/POST | `/notifications/templates` | admin | List / create-or-update templates |
| PUT/DELETE | `/notifications/templates/:id` | admin | Manage a template |
| POST | `/notifications/dispatch` | admin | Send a templated multi-channel notification |

## Sending from code

```ts
import { dispatchNotification } from '@api/modules/notifications/notification-dispatch.service';

await dispatchNotification({
  userId, clinicId,
  type: 'appointment_reminder',
  templateKey: 'appointment_reminder',
  variables: { patientName: 'Ada', date: 'Mon 3 Nov, 10:00' },
  channels: ['in_app', 'email', 'sms'],   // optional — defaults to all, then filtered by prefs
  scheduledFor: new Date(Date.now() + 3_600_000), // optional
});
```

Critical types (`balance_critical`, `high_risk_patient`, `unrecognized_transaction`,
`large_transaction`, `lab_result_ready`) bypass preferences and quiet hours.

## Configuration

| Env var | Channel |
| --- | --- |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` | email |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` | sms |
| `FCM_SERVER_KEY` | push |

When a channel's provider is not configured the delivery is recorded as
`skipped` rather than `failed`.
