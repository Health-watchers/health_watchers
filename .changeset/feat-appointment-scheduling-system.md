---
"api": minor
---

feat: sophisticated appointment scheduling system (#1242)

- Appointment availability algorithm with configurable slot durations, buffer times, and clinic hours
- Conflict detection preventing double-bookings (atomic check in JS, no user-controlled operators in query)
- Appointment reminder job: 24h and 1h reminders via email + in-app notifications
- Rescheduling workflow with real-time socket events and notification cascade
- Waitlist management with priority queue (urgent-first), auto-notify on slot opening, 48h expiry
- Appointment analytics: status/type breakdown, no-show/cancellation/completion rates, per-doctor stats
- Appointment templates: CRUD with buffer times, telemedicine flag, usage tracking
- Duration validation: per-type min/max rules, soft warnings, clinic-hours guard
- Telehealth support: video room creation (Daily.co/Jitsi/Twilio), access token generation, call lifecycle
- Appointment clustering: identifies busy windows, suggests optimal free slots to reduce idle time
- DB migration: compound indexes for analytics queries and appointmenttemplates collection
- 25-test comprehensive suite covering all new services and edge cases

New API endpoints:
  GET    /api/v1/appointment-analytics
  GET    /api/v1/appointment-templates
  POST   /api/v1/appointment-templates
  GET    /api/v1/appointment-templates/:id
  PUT    /api/v1/appointment-templates/:id
  DELETE /api/v1/appointment-templates/:id
  GET    /api/v1/appointments/doctor/:doctorId/availability/enhanced
  GET    /api/v1/appointments/doctor/:doctorId/clusters

Closes #1242
