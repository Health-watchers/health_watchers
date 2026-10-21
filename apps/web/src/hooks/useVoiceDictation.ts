'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';
import { expandShorthandInText } from '@/lib/medicalShorthand';

// Minimal type for the Web Speech API — avoids needing @types/dom-speech
interface SpeechRecognitionResult {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

export type DictationStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'transcribing'
  | 'denied'
  | 'error';

export type DictationEngine = 'webspeech' | 'upload';

export interface VoiceDictation {
  /** Whether voice dictation is available in this browser */
  availability: { available: boolean; engine: DictationEngine; reason?: string };
  /** Current state of the dictation session */
  status: DictationStatus;
  /** Key identifying which SOAP section is currently being dictated into */
  activeKey: string | null;
  /** Interim (non-final) transcript for live display */
  interim: string;
  /** Elapsed recording time in seconds */
  elapsed: number;
  /** Human-readable error message; null when no error */
  error: string | null;
  /** Start recording into the section identified by `key` */
  start: (key: string, onFinal: (text: string) => void) => void;
  /** Stop recording and trigger transcription */
  stop: () => void;
  /** Clear any error state */
  dismissError: () => void;
}

/**
 * useVoiceDictation — manages microphone recording and speech-to-text.
 *
 * Two engines:
 * 1. **Web Speech API** (Chrome, Edge) — real-time interim results, no server round-trip.
 * 2. **Upload fallback** (Firefox, Safari) — records audio with MediaRecorder,
 *    sends it to `POST /api/v1/ai/transcribe`, and receives corrected + SOAP-structured text.
 *
 * In both cases, shorthand abbreviations in the final transcript are expanded
 * (e.g. "SOB" → "Shortness of breath") before being inserted into the editor.
 */
export function useVoiceDictation(): VoiceDictation {
  // ── Engine detection ───────────────────────────────────────────────────────
  const hasWebSpeech =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const hasMediaRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window;

  const availability: { available: boolean; engine: DictationEngine; reason?: string } = {
    available: hasWebSpeech || hasMediaRecorder,
    engine: (hasWebSpeech ? 'webspeech' : 'upload') as DictationEngine,
  };
  if (!hasWebSpeech && !hasMediaRecorder) {
    availability.reason =
      'Voice dictation requires Chrome/Edge (Web Speech API) or a browser with MediaRecorder support.';
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Refs for mutable objects that shouldn't trigger re-renders ─────────────
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const onFinalRef = useRef<((text: string) => void) | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Web Speech API engine ──────────────────────────────────────────────────
  const startWebSpeech = useCallback(
    (key: string, onFinal: (text: string) => void) => {
      const Ctor =
        (window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

      if (!Ctor) {
        setError('Speech recognition is not available in this browser.');
        setStatus('error');
        return;
      }

      const recognition = new (Ctor as new () => SpeechRecognitionLike)();
      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result && result.isFinal) {
            const finalText = expandShorthandInText(result[0].transcript);
            onFinal(finalText);
          } else if (result) {
            interimText += result[0].transcript;
          }
        }
        setInterim(interimText);
      };

      recognition.onend = () => {
        setInterim('');
        setStatus('idle');
        setActiveKey(null);
        activeKeyRef.current = null;
        clearTimer();
      };

      recognition.onerror = (event: { error: string }) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setError(
            'Microphone access denied. Please allow microphone permissions in your browser.'
          );
          setStatus('denied');
        } else {
          setError(`Speech recognition error: ${event.error}`);
          setStatus('error');
        }
        clearTimer();
      };

      recognitionRef.current = recognition;
      onFinalRef.current = onFinal;
      activeKeyRef.current = key;
      setStatus('starting');
      setActiveKey(key);
      elapsedRef.current = 0;
      setElapsed(0);

      try {
        recognition.start();
        setStatus('recording');
        clearTimer();
        timerRef.current = setInterval(() => {
          elapsedRef.current += 1;
          setElapsed(elapsedRef.current);
        }, 1000);
      } catch {
        setError('Failed to start speech recognition.');
        setStatus('error');
      }
    },
    [clearTimer]
  );

  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setInterim('');
    clearTimer();
  }, [clearTimer]);

  // ── Upload (MediaRecorder) engine ──────────────────────────────────────────
  const startUpload = useCallback(
    async (key: string, onFinal: (text: string) => void) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        audioChunksRef.current = [];

        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          setStatus('transcribing');
          setInterim('');
          clearTimer();
          stopStream();

          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const formData = new FormData();
          formData.append('audio', blob, 'dictation.webm');

          try {
            // First try the dedicated transcription endpoint (audio upload)
            const res = await fetchWithAuth(`${API_V1}/ai/transcribe`, {
              method: 'POST',
              body: formData,
            });

            if (res.ok) {
              const json = await res.json();
              // The API returns { corrected, soap: { S, O, A, P } }
              const corrected: string = json?.data?.corrected ?? json?.corrected ?? '';
              if (corrected) {
                onFinalRef.current?.(expandShorthandInText(corrected));
              }
            } else {
              throw new Error(`Transcription failed (${res.status})`);
            }
          } catch {
            // Fallback: try text-based transcription endpoint
            try {
              // Use the raw interim as fallback text
              const fallbackText = interim || 'Unable to transcribe audio.';
              const res = await fetchWithAuth(`${API_V1}/ai/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: fallbackText }),
              });

              if (res.ok) {
                const json = await res.json();
                const corrected: string = json?.data?.corrected ?? json?.corrected ?? fallbackText;
                onFinalRef.current?.(expandShorthandInText(corrected));
              } else {
                setError('Transcription service unavailable. Please try again or type manually.');
                setStatus('error');
              }
            } catch {
              setError('Transcription service unavailable. Please try again or type manually.');
              setStatus('error');
            }
          }

          setStatus('idle');
          setActiveKey(null);
          activeKeyRef.current = null;
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
        onFinalRef.current = onFinal;
        activeKeyRef.current = key;
        setStatus('recording');
        setActiveKey(key);
        elapsedRef.current = 0;
        setElapsed(0);

        clearTimer();
        timerRef.current = setInterval(() => {
          elapsedRef.current += 1;
          setElapsed(elapsedRef.current);
        }, 1000);
      } catch {
        setError('Microphone access denied. Please allow microphone permissions in your browser.');
        setStatus('denied');
      }
    },
    [clearTimer, stopStream, interim]
  );

  const stopUpload = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    clearTimer();
  }, [clearTimer]);

  // ── Public API ─────────────────────────────────────────────────────────────
  const start = useCallback(
    (key: string, onFinal: (text: string) => void) => {
      setError(null);
      if (hasWebSpeech) {
        startWebSpeech(key, onFinal);
      } else if (hasMediaRecorder) {
        startUpload(key, onFinal);
      } else {
        setError('Voice dictation is not supported in this browser.');
        setStatus('error');
      }
    },
    [hasWebSpeech, hasMediaRecorder, startWebSpeech, startUpload]
  );

  const stop = useCallback(() => {
    if (hasWebSpeech) {
      stopWebSpeech();
    } else {
      stopUpload();
    }
  }, [hasWebSpeech, stopWebSpeech, stopUpload]);

  const dismissError = useCallback(() => {
    setError(null);
    if (status === 'error' || status === 'denied') setStatus('idle');
  }, [status]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [clearTimer, stopStream]);

  return {
    availability,
    status,
    activeKey,
    interim,
    elapsed,
    error,
    start,
    stop,
    dismissError,
  };
}
