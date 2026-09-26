'use client';
/* eslint-disable @typescript-eslint/no-explicit-any -- the Web Speech API ships no TS types */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authJson } from '@/lib/authJson';

/**
 * Voice dictation for clinical notes (#1419).
 *
 * Two engines:
 *  - `speech`: the browser's Web Speech API (live interim results).
 *  - `upload`: record with MediaRecorder and send the clip to /ai/transcribe-audio.
 *
 * Privacy: both engines move audio off the device — Chrome, Edge and Safari run Web Speech
 * recognition on their vendors' cloud services, and the upload path goes to the clinic's AI
 * provider. So dictation stays unavailable until the clinic has enabled AI voice dictation;
 * the API enforces the same rule for the upload path.
 */

export type DictationEngine = 'speech' | 'upload';
export type DictationStatus =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'transcribing'
  | 'denied'
  | 'error';

interface AiSettings {
  enabled: boolean;
  voiceDictation: boolean;
  serviceAvailable: boolean;
}

export interface DictationAvailability {
  available: boolean;
  engine: DictationEngine | null;
  /** Why the mic is disabled — shown as the button's tooltip. */
  reason: string | null;
  loading: boolean;
}

type SpeechRecognitionLike = any;

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function canRecordAudio(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickRecorderMime(): string | undefined {
  const MR = (window as any).MediaRecorder;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) =>
    MR?.isTypeSupported?.(t)
  );
}

const MAX_UPLOAD_SECONDS = 5 * 60;

export function useVoiceDictation() {
  const settingsQ = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => authJson<AiSettings>('/ai/settings'),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  // Browser capabilities are only known on the client — resolve after mount to avoid
  // hydration mismatches.
  const [caps, setCaps] = useState<{ speech: boolean; record: boolean } | null>(null);
  useEffect(() => {
    setCaps({ speech: !!getSpeechRecognitionCtor(), record: canRecordAudio() });
  }, []);

  const [status, setStatus] = useState<DictationStatus>('idle');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionLike>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);

  const availability: DictationAvailability = (() => {
    const settings = settingsQ.data;
    if (!caps || settingsQ.isLoading) {
      return {
        available: false,
        engine: null,
        reason: 'Checking dictation support…',
        loading: true,
      };
    }
    if (!caps.speech && !caps.record) {
      return {
        available: false,
        engine: null,
        reason: 'Voice dictation isn’t supported in this browser.',
        loading: false,
      };
    }
    if (!settings?.voiceDictation) {
      return {
        available: false,
        engine: null,
        reason:
          'Voice dictation is turned off for your clinic. An admin can enable AI voice dictation in clinic settings.',
        loading: false,
      };
    }
    if (caps.speech) return { available: true, engine: 'speech', reason: null, loading: false };
    if (!settings.serviceAvailable) {
      return {
        available: false,
        engine: null,
        reason: 'The transcription service is not configured.',
        loading: false,
      };
    }
    return { available: true, engine: 'upload', reason: null, loading: false };
  })();

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const reset = useCallback(() => {
    clearTimer();
    setInterim('');
    setActiveKey(null);
    setElapsed(0);
  }, []);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    clearTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    } else if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop(); // onstop uploads the clip
    } else {
      setStatus((s) => (s === 'recording' || s === 'starting' ? 'idle' : s));
      reset();
    }
  }, [reset]);

  const start = useCallback(
    async (key: string, onFinal: (text: string) => void) => {
      if (!availability.available || !availability.engine) return;
      if (status === 'recording' || status === 'starting' || status === 'transcribing') return;

      stoppingRef.current = false;
      setError(null);
      setInterim('');
      setElapsed(0);
      setActiveKey(key);
      setStatus('starting');

      const startTimer = () => {
        const began = Date.now();
        clearTimer();
        timerRef.current = setInterval(() => {
          const secs = Math.floor((Date.now() - began) / 1000);
          setElapsed(secs);
          if (availability.engine === 'upload' && secs >= MAX_UPLOAD_SECONDS) stop();
        }, 500);
      };

      if (availability.engine === 'speech') {
        const Ctor = getSpeechRecognitionCtor()!;
        const rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = navigator.language || 'en-US';

        rec.onstart = () => {
          setStatus('recording');
          startTimer();
        };
        rec.onresult = (event: any) => {
          let pending = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const text = result[0]?.transcript ?? '';
            if (result.isFinal) {
              if (text.trim()) onFinal(text.trim());
            } else {
              pending += text;
            }
          }
          setInterim(pending);
        };
        rec.onerror = (event: any) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            setStatus('denied');
            setError('Microphone access was blocked.');
          } else if (event.error === 'no-speech' || event.error === 'aborted') {
            // benign — onend resets
          } else {
            setStatus('error');
            setError(
              event.error === 'network'
                ? 'Speech recognition needs a network connection.'
                : 'Dictation stopped unexpectedly.'
            );
          }
        };
        rec.onend = () => {
          recognitionRef.current = null;
          setStatus((s) => (s === 'denied' || s === 'error' ? s : 'idle'));
          reset();
        };

        recognitionRef.current = rec;
        try {
          rec.start();
        } catch {
          recognitionRef.current = null;
          setStatus('error');
          setError('Could not start dictation.');
          reset();
        }
        return;
      }

      // Upload engine
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        const name = (err as DOMException)?.name;
        setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'Microphone access was blocked.'
            : name === 'NotFoundError'
              ? 'No microphone was found.'
              : 'Could not access the microphone.'
        );
        reset();
        return;
      }
      streamRef.current = stream;

      const mimeType = pickRecorderMime();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        recorderRef.current = null;
        releaseMic();
        clearTimer();
        const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type });
        if (blob.size === 0) {
          setStatus('idle');
          reset();
          return;
        }
        setStatus('transcribing');
        setInterim('Transcribing…');
        try {
          const form = new FormData();
          form.append('audio', blob, `dictation.${type.split('/')[1] ?? 'webm'}`);
          const { text } = await authJson<{ text: string }>('/ai/transcribe-audio', {
            method: 'POST',
            body: form,
          });
          if (text?.trim()) onFinal(text.trim());
          setStatus('idle');
        } catch (err) {
          setStatus('error');
          setError((err as Error).message || 'Transcription failed.');
        } finally {
          reset();
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setStatus('recording');
      startTimer();
    },
    [availability.available, availability.engine, status, reset, stop]
  );

  // Release the microphone if the editor unmounts mid-recording
  useEffect(
    () => () => {
      clearTimer();
      recognitionRef.current?.abort?.();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      releaseMic();
    },
    []
  );

  const dismissError = useCallback(() => {
    setError(null);
    setStatus('idle');
  }, []);

  return { availability, status, activeKey, interim, error, elapsed, start, stop, dismissError };
}

export type VoiceDictation = ReturnType<typeof useVoiceDictation>;
