---
"web": minor
---

feat(notifications): notification preferences UI (#1315)

- New `/settings/notifications` workspace with six tabs: types & channels,
  delivery & quiet hours, content & preview, history, templates & test, and
  unsubscribe
- `NotificationTypeSelector` — 8 notification categories with a critical badge
  for safety-critical types
- `ChannelPreferences` — email, push, SMS and in-app toggles with a warning
  when no channel is enabled
- `FrequencyControls` — immediate / daily digest / weekly digest plus the digest
  delivery time
- `QuietHoursSchedule` — quiet-hour window that supports wrapping past
  midnight, a safety-critical override and a live "currently in quiet hours"
  indicator
- `ContentPreferences` — full details / summary only / minimal
- `NotificationPreview` — renders the chosen template with the selected content
  level and the delivery decision the current preferences produce
- `NotificationHistoryList` — history with channel, type and unread filters and
  mark-as-read actions
- `NotificationTemplatesViewer` — all templates with their raw bodies and a
  channel filter
- `NotificationTester` — sends a test through the same delivery rules the real
  sender uses and reports the outcome
- `UnsubscribeManagement` — unsubscribe-all, per-category opt-out and a
  subscribe-to-everything shortcut
- Domain layer in `src/lib/notification-preferences`: types, definitions and
  defaults, the `effectiveDelivery` rule engine (the single source of truth for
  preference handling), templates, validated local-storage persistence and
  sample history, with 14 unit tests
