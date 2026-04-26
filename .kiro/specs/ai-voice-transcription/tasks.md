# Implementation Plan: AI Voice Transcription

## Tasks

- [ ] 1. Extend AI service with transcribe method
  - [ ] 1.1 Add `transcribe(input: { text?: string; audioBuffer?: Buffer; mimeType?: string }): Promise<{ corrected: string; soap: { S: string; O: string; A: string; P: string } }>` to `apps/api/src/modules/ai/ai.service.ts`. For text input, call Gemini with the medical scribe prompt. For audio input, use Gemini's audio understanding API. Return structured JSON. Throw `ServiceUnavailableError` if Gemini is unreachable.
    - _Requirements: 2.2, 2.3, 3.3_

- [ ] 2. Implement transcribe endpoint
  - [ ] 2.1 Add `POST /transcribe` route to `apps/api/src/modules/ai/ai.routes.ts`. Accept `application/json` `{ text }` or `multipart/form-data` with `audio` file. Apply `authenticate` and `requireRoles('DOCTOR','NURSE')`. Call `aiService.transcribe()`. Return 200 with `{ corrected, soap }`. Map `ServiceUnavailableError` to 503.
    - _Requirements: 2.1, 2.4, 2.5, 3.4_
  - [ ]* 2.2 Write property test for correction endpoint input/output contract
    - **Property 1: Correction endpoint input/output contract**
    - **Validates: Requirements 2.1, 2.2, 2.3**
  - [ ]* 2.3 Write property test for role enforcement
    - **Property 2: Role enforcement**
    - **Validates: Requirements 2.5**

- [ ] 3. Implement VoiceRecorder component
  - [ ] 3.1 Create `apps/web/src/components/encounters/notes/VoiceRecorder.tsx`. Detect Web Speech API support. If supported: render mic button, manage `SpeechRecognition` with `continuous: true` and `interimResults: true`, emit `onInterim` and `onFinal` callbacks, show pulsing red dot when recording, handle `onError` for permission denial with inline message. If unsupported: render audio file input accepting `.wav,.mp3`, on file select POST to `/api/v1/ai/transcribe` as multipart and emit `onFinal` with returned transcription.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 3.1, 3.2, 3.3_
  - [ ]* 3.2 Write unit tests for VoiceRecorder
    - Test: mic button renders when API available; audio upload renders when unavailable; permission error shows message; onInterim/onFinal callbacks fire correctly
    - **Validates: Requirements 1.5, 1.6, 3.1**

- [ ] 4. Implement TranscriptionPreview component
  - [ ] 4.1 Create `apps/web/src/components/encounters/notes/TranscriptionPreview.tsx`. Render editable textarea with transcription buffer (interim text in gray via CSS class, final in default color). Render "Correct with AI" button that POSTs `{ text }` to `/api/v1/ai/transcribe` and updates the textarea with `corrected` text and populates SOAP fields via `onSoapDetected` callback. Render "Undo" button that calls `onUndo` prop.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ]* 4.2 Write unit tests for TranscriptionPreview
    - Test: undo calls onUndo; "Correct with AI" calls endpoint and updates text; SOAP callback fires with structured data
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [ ] 5. Integrate into EncounterNotesEditor
  - [ ] 5.1 Update `apps/web/src/components/encounters/EncounterNotesEditor.tsx` to: import `VoiceRecorder` and `TranscriptionPreview`; maintain `preTranscriptionSnapshot` state (snapshot notes value when recording starts); pass `onUndo` that restores snapshot; pass `onSoapDetected` that populates S/O/A/P note fields; render components in the notes editor toolbar area.
    - _Requirements: 1.1, 4.3, 4.4, 4.5_

- [ ] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked `*` are optional
- Web Speech API browser support: Chrome (full), Firefox (partial), Safari (partial) — graceful degradation via fallback
- Gemini model to use: `gemini-1.5-flash` (already configured in `ai.service.ts`)
- Property tests use `fast-check`
