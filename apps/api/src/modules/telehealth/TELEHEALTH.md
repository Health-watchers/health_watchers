# Telehealth — #1249

Video-visit lifecycle for telemedicine appointments: room provisioning, secure
join links, consent-gated recording with an audit trail, transcription, in-meeting
chat, screen-share/caption controls, bandwidth optimisation and a per-session
archive.

## Layout

```
telehealth/
  models/
    telehealth-session.model.ts       room handle, status, features, participants, bandwidth
    telehealth-recording.model.ts     consent ledger + immutable auditTrail
    telehealth-transcript.model.ts    STT segments (also backs live captions)
    telehealth-chat-message.model.ts  in-meeting chat
  video-provider.ts                   VideoProvider interface + MockVideoProvider + factory
  meeting-link.service.ts             HMAC-signed, expiring, tamper-evident join tokens
  telehealth-session.service.ts       create / start / join / end / cancel / captions / bandwidth
  telehealth-recording.service.ts     init consent → recordConsent → start (gated) → stop
  telehealth-transcription.service.ts pluggable STT engine (mock by default)
  telehealth-chat.service.ts          post / list messages, socket fan-out
  telehealth-archive.service.ts       bundle recording + transcript + chat, mark archived
  telehealth.controller.ts            REST routes, mounted at /api/v1/telehealth
```

## Video provider

Everything goes through the `VideoProvider` interface. `MockVideoProvider` is a
working in-process implementation (deterministic room ids, real token TTLs) used
for dev and tests. Select a provider with `TELEHEALTH_VIDEO_PROVIDER`
(`mock` | `twilio` | `zoom`); the Twilio/Zoom slots are stubs that surface a
clear "not configured" error until their SDK adapter and credentials are wired.
Inject a custom provider in tests with `setVideoProvider()`.

## Recording & consent

`POST /recording/init` opens consent, `POST /recording/consent` records each
party's decision, and `POST /recording/start` **refuses with 409** until every
role in `requiredConsentRoles` has consented. Every state change is written both
to the recording's own `auditTrail` and to the central audit log
(`TELEHEALTH_RECORDING_*`).

## Bandwidth optimisation

`bandwidthProfile` (`low` | `standard` | `high` | `auto`) resolves to concrete
`MediaConstraints` (bitrate/framerate/resolution + an `audioOnlyBelowKbps`
threshold) returned on join and on `PATCH /bandwidth`, so the client can adapt
media quality to the connection.

## Accessibility

`features.captions` toggles live captions (`PATCH /captions`); the transcription
service supplies the caption/transcript text.

## Configuration

| Env var | Purpose |
| --- | --- |
| `TELEHEALTH_VIDEO_PROVIDER` | `mock` (default), `twilio`, `zoom` |
| `TELEHEALTH_LINK_SECRET` | HMAC key for meeting links (falls back to `JWT_ACCESS_TOKEN_SECRET`) |
| `WEB_URL` | Base URL used to build join links |
| `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID` | Twilio video (when selected) |
| `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | Zoom (when selected) |
