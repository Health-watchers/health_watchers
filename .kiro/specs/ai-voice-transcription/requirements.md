# Requirements Document

## Introduction

This feature adds AI-powered voice transcription to the clinical notes editor. Doctors use the Web Speech API for real-time browser-based transcription, then send the raw text to a Gemini-backed endpoint for medical terminology correction and SOAP note structuring. An audio file upload fallback supports browsers without Web Speech API support.

## Requirements

### Requirement 1: Web Speech API Integration

**User Story:** As a doctor, I want to dictate clinical notes by voice, so that I can reduce documentation time during encounters.

#### Acceptance Criteria

1. WHEN the encounter notes editor is displayed, THE Notes_Editor SHALL render a microphone button to start/stop voice recording.
2. WHEN recording starts, THE Notes_Editor SHALL use the Web Speech API (`SpeechRecognition`) with `continuous: true` and `interimResults: true`.
3. WHEN interim results are received, THE Notes_Editor SHALL display them in gray text in the transcription preview area.
4. WHEN final results are received, THE Notes_Editor SHALL display them in black text and append them to the transcription buffer.
5. WHEN recording is active, THE Notes_Editor SHALL display a pulsing red recording indicator.
6. WHEN the microphone permission is denied or unavailable, THE Notes_Editor SHALL display a descriptive error message and SHALL NOT crash.

---

### Requirement 2: AI Correction Endpoint

**User Story:** As a doctor, I want my transcribed notes corrected for medical terminology and structured as a SOAP note, so that the final note is accurate and well-formatted.

#### Acceptance Criteria

1. THE system SHALL expose `POST /api/v1/ai/transcribe` accepting `{ text: string }`.
2. WHEN the endpoint receives raw transcription text, it SHALL send the text to Gemini with a prompt instructing it to correct medical terminology, expand abbreviations, add punctuation, and detect SOAP structure.
3. THE endpoint SHALL return `{ corrected: string, soap: { S: string, O: string, A: string, P: string } }`.
4. WHEN Gemini is unavailable, THE endpoint SHALL return a 503 response.
5. THE endpoint SHALL require the requesting user to have the `DOCTOR` or `NURSE` role.

---

### Requirement 3: Audio Upload Fallback

**User Story:** As a doctor using a browser without Web Speech API support, I want to upload an audio file for transcription, so that I can still use voice-to-text.

#### Acceptance Criteria

1. WHEN the Web Speech API is not available in the browser, THE Notes_Editor SHALL display an audio file upload button instead of the microphone button.
2. THE Notes_Editor SHALL accept WAV and MP3 files up to 5 minutes in duration.
3. WHEN an audio file is uploaded, THE Notes_Editor SHALL send it to Gemini's audio understanding API and return the transcription text.
4. THE audio upload SHALL use the same `POST /api/v1/ai/transcribe` endpoint with a `multipart/form-data` body containing the audio file.

---

### Requirement 4: Frontend Transcription UX

**User Story:** As a doctor, I want to review, edit, and undo transcribed text before saving, so that I have full control over the final note content.

#### Acceptance Criteria

1. WHEN transcription is complete, THE Notes_Editor SHALL display a "Correct with AI" button.
2. WHEN "Correct with AI" is clicked, THE Notes_Editor SHALL call `POST /api/v1/ai/transcribe` and replace the transcription preview with the corrected text and SOAP structure.
3. THE Notes_Editor SHALL provide an "Undo" button that reverts the notes field to its pre-transcription state.
4. THE transcription preview SHALL be editable before the doctor saves the note.
5. THE transcription feature SHALL function in Chrome, Firefox, and Safari (with graceful degradation where Web Speech API is unsupported).
