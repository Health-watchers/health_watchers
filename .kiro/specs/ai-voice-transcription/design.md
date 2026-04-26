# Design Document: AI Voice Transcription

## Overview

Adds voice-to-text transcription to the encounter notes editor using the Web Speech API for real-time dictation and Gemini for medical terminology correction and SOAP note structuring. An audio file upload fallback handles unsupported browsers.

## Architecture

```
Browser (Web Speech API) → real-time interim/final results → transcription buffer
Doctor clicks "Correct with AI" → POST /api/v1/ai/transcribe → Gemini → corrected + SOAP
Fallback: audio file upload → POST /api/v1/ai/transcribe (multipart) → Gemini audio API → transcription
```

## API

### POST /api/v1/ai/transcribe

- Auth: `DOCTOR | NURSE`
- Accepts: `application/json` `{ text: string }` OR `multipart/form-data` with `audio` file (WAV/MP3)
- Returns: `{ corrected: string, soap: { S: string, O: string, A: string, P: string } }`
- Errors: 400 missing input, 503 Gemini unavailable

Gemini prompt (text mode):
```
You are a medical scribe. Given raw voice transcription, correct medical terminology, expand abbreviations (e.g. SOB → shortness of breath), add punctuation, and structure the note into SOAP format. Return JSON: { "corrected": "...", "soap": { "S": "...", "O": "...", "A": "...", "P": "..." } }
```

## Data Models

No new database models. The existing `ai.service.ts` is extended with a `transcribe(input)` method.

## Frontend Components

### `VoiceRecorder.tsx` (`apps/web/src/components/encounters/notes/`)
- Manages `SpeechRecognition` lifecycle (start/stop)
- Emits `onInterim(text)` and `onFinal(text)` callbacks
- Shows pulsing red dot when recording
- Detects Web Speech API support; renders audio upload fallback if unavailable
- Handles permission denial with inline error

### `TranscriptionPreview.tsx`
- Editable textarea showing transcription buffer
- Interim results in gray, final in black
- "Correct with AI" button → calls `/api/v1/ai/transcribe`
- "Undo" button → restores pre-transcription snapshot

### Integration in `EncounterNotesEditor.tsx`
- Renders `VoiceRecorder` and `TranscriptionPreview`
- Maintains `preTranscriptionSnapshot` state for undo
- On AI correction success, populates SOAP fields if present

## Correctness Properties

### Property 1: Correction endpoint input/output contract
For any non-empty `text` input, the endpoint must return a response with both `corrected` (non-empty string) and `soap` with keys S, O, A, P (each a string, possibly empty).
**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: Role enforcement
For any request to `POST /api/v1/ai/transcribe` from a user without `DOCTOR` or `NURSE` role, the response must be 403. Unauthenticated requests must return 401.
**Validates: Requirements 2.5**

### Property 3: Undo invariant
For any transcription session, clicking "Undo" must restore the notes field to exactly the value it held before the transcription session began, regardless of how many corrections were applied.
**Validates: Requirements 4.3**

### Property 4: Fallback detection
When `window.SpeechRecognition` and `window.webkitSpeechRecognition` are both undefined, the microphone button must not render and the audio upload input must render instead.
**Validates: Requirements 3.1**

## Error Handling

| Scenario | Response |
|---|---|
| Empty `text` field | 400 BadRequest |
| Gemini API unavailable | 503 ServiceUnavailable |
| Unauthenticated | 401 |
| Insufficient role | 403 |
| Audio file too large / wrong format | 400 |

## Testing Strategy

- Unit: `ai.service.ts` transcribe method with mocked Gemini client
- Unit: `VoiceRecorder` — mock SpeechRecognition, test interim/final callbacks and permission error
- Unit: `TranscriptionPreview` — test undo restores snapshot, test "Correct with AI" calls endpoint
- PBT (fast-check): Property 1 — generate arbitrary text strings, verify response shape; Property 2 — generate non-authorized roles, verify 403
