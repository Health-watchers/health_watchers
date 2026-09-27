'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSuggestions, expandShorthandInText } from '@/lib/medicalShorthand';
import { useVoiceDictation, type VoiceDictation } from '@/hooks/useVoiceDictation';

interface SoapNotes {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

interface Props {
  value: SoapNotes;
  onChange: (notes: SoapNotes) => void;
  onAutoSave?: (notes: SoapNotes) => void;
  readOnly?: boolean;
}

const SOAP_TABS = [
  {
    key: 'subjective' as const,
    label: 'S — Subjective',
    placeholder: "Patient's reported symptoms, complaints, and history…",
  },
  {
    key: 'objective' as const,
    label: 'O — Objective',
    placeholder: 'Physical examination findings, vitals, test results…',
  },
  {
    key: 'assessment' as const,
    label: 'A — Assessment',
    placeholder: "Doctor's clinical assessment and differential diagnosis…",
  },
  {
    key: 'plan' as const,
    label: 'P — Plan',
    placeholder: 'Treatment plan, medications, referrals, follow-up…',
  },
];

function EditorToolbar({ editor, children }: { editor: Editor; children?: React.ReactNode }) {
  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-xs font-medium border transition-colors ${
      active
        ? 'bg-primary-600 text-white border-primary-600'
        : 'bg-white text-secondary-700 border-secondary-300 hover:bg-secondary-50'
    }`;

  return (
    <div className="border-secondary-200 bg-secondary-50 flex flex-wrap gap-1 border-b px-3 py-2">
      <button
        type="button"
        className={btn(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </button>
      <button
        type="button"
        className={btn(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        className={btn(editor.isActive('underline'))}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </button>
      <span className="text-secondary-300 mx-1">|</span>
      <button
        type="button"
        className={btn(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </button>
      <button
        type="button"
        className={btn(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </button>
      <span className="text-secondary-300 mx-1">|</span>
      <button
        type="button"
        className={btn(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </button>
      <button
        type="button"
        className={btn(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </button>
      {children}
    </div>
  );
}

function formatElapsed(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function DictationButton({
  sectionKey,
  sectionLabel,
  dictation,
  onFinal,
}: {
  sectionKey: string;
  sectionLabel: string;
  dictation: VoiceDictation;
  onFinal: (text: string) => void;
}) {
  const { availability, status, activeKey, elapsed } = dictation;
  const isActive = activeKey === sectionKey;
  const recording = isActive && (status === 'recording' || status === 'starting');
  const transcribing = isActive && status === 'transcribing';
  const busyElsewhere =
    !isActive && (status === 'recording' || status === 'starting' || status === 'transcribing');
  const tooltipId = `dictation-tip-${sectionKey}`;

  if (!availability.available) {
    // Disabled buttons don't emit hover events in every browser, so the tooltip sits on a wrapper
    return (
      <span className="ml-auto inline-flex" title={availability.reason ?? undefined}>
        <button
          type="button"
          disabled
          aria-describedby={tooltipId}
          className="border-secondary-300 text-secondary-400 flex cursor-not-allowed items-center gap-1 rounded border bg-white px-2 py-1 text-xs opacity-60"
        >
          <MicIcon /> Dictate
        </button>
        <span id={tooltipId} className="sr-only">
          {availability.reason}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={busyElsewhere || transcribing}
      onClick={() => (recording ? dictation.stop() : dictation.start(sectionKey, onFinal))}
      aria-pressed={recording}
      aria-label={
        recording ? `Stop dictating into ${sectionLabel}` : `Dictate into ${sectionLabel}`
      }
      title={
        availability.engine === 'upload'
          ? 'Recording is transcribed by your clinic’s AI service when you stop'
          : 'Speak to insert text at the cursor'
      }
      className={[
        'ml-auto flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        recording
          ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
          : 'border-secondary-300 text-secondary-700 hover:bg-secondary-50 bg-white',
      ].join(' ')}
    >
      {recording ? (
        <>
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          Stop · {formatElapsed(elapsed)}
        </>
      ) : transcribing ? (
        <>Transcribing…</>
      ) : (
        <>
          <MicIcon /> Dictate
        </>
      )}
    </button>
  );
}

function MicIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15a3 3 0 01-3-3V4.5a3 3 0 116 0V12a3 3 0 01-3 3z"
      />
    </svg>
  );
}

function SoapTabEditor({
  sectionKey,
  sectionLabel,
  content,
  placeholder,
  onChange,
  readOnly,
  dictation,
}: {
  sectionKey: string;
  sectionLabel: string;
  content: string;
  placeholder: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  dictation?: VoiceDictation;
}) {
  const [suggestions, setSuggestions] = useState<Array<{ abbr: string; expansion: string }>>([]);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [StarterKit, Underline, CharacterCount, Placeholder.configure({ placeholder })],
    content,
    editable: !readOnly,
    onUpdate({ editor }) {
      onChange(editor.getHTML());

      // Shorthand autocomplete: get the word before cursor
      const { from } = editor.state.selection;
      const text = editor.state.doc.textBetween(Math.max(0, from - 20), from, ' ');
      const lastWord = text.split(/\s/).pop() ?? '';
      const matches = getSuggestions(lastWord);
      setSuggestions(matches);

      // Position dropdown near cursor
      const coords = editor.view.coordsAtPos(from);
      const wrapper = wrapperRef.current?.getBoundingClientRect();
      if (wrapper) {
        setSuggestionPos({
          top: coords.bottom - wrapper.top + 4,
          left: coords.left - wrapper.left,
        });
      }
    },
    onBlur() {
      setSuggestions([]);
    },
  });

  // Sync external content changes (e.g. template load)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content]); // eslint-disable-line react-hooks/exhaustive-deps

  const applySuggestion = (expansion: string) => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const text = editor.state.doc.textBetween(Math.max(0, from - 20), from, ' ');
    const lastWord = text.split(/\s/).pop() ?? '';
    editor
      .chain()
      .focus()
      .deleteRange({ from: from - lastWord.length, to: from })
      .insertContent(expansion)
      .run();
    setSuggestions([]);
  };

  // Dictated text goes in at the cursor (or replaces the selection) as a plain text node —
  // never parsed as HTML — after shorthand expansion.
  const insertDictation = (raw: string) => {
    if (!editor || editor.isDestroyed) return;
    const text = expandShorthandInText(raw);
    const { from } = editor.state.selection;
    const before = editor.state.doc.textBetween(Math.max(0, from - 1), from, ' ');
    const needsSpace = before !== '' && !/\s$/.test(before);
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text: `${needsSpace ? ' ' : ''}${text}` })
      .run();
  };

  const isDictating =
    !!dictation &&
    dictation.activeKey === sectionKey &&
    (dictation.status === 'recording' || dictation.status === 'transcribing');

  const charCount = editor?.storage.characterCount?.characters() ?? 0;

  return (
    <div ref={wrapperRef} className="relative">
      {editor && !readOnly && (
        <EditorToolbar editor={editor}>
          {dictation && (
            <DictationButton
              sectionKey={sectionKey}
              sectionLabel={sectionLabel}
              dictation={dictation}
              onFinal={insertDictation}
            />
          )}
        </EditorToolbar>
      )}
      <EditorContent
        editor={editor}
        className="prose prose-sm min-h-[140px] max-w-none px-4 py-3 focus-within:outline-none"
      />
      {isDictating && (
        <div
          className="flex items-start gap-2 border-t border-red-100 bg-red-50/60 px-4 py-2 text-sm"
          role="status"
          aria-live="polite"
        >
          <span
            className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-600"
            aria-hidden="true"
          />
          <span className="text-secondary-400 italic">
            {dictation!.interim ||
              (dictation!.status === 'transcribing'
                ? 'Transcribing…'
                : dictation!.availability.engine === 'upload'
                  ? 'Recording — text is inserted when you stop.'
                  : 'Listening…')}
          </span>
        </div>
      )}
      {/* Shorthand autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div
          className="border-secondary-200 absolute z-50 rounded-md border bg-white shadow-lg"
          style={{ top: suggestionPos.top, left: suggestionPos.left }}
        >
          {suggestions.map(({ abbr, expansion }) => (
            <button
              key={abbr}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(expansion);
              }}
              className="hover:bg-primary-50 flex w-full items-center gap-3 px-3 py-2 text-left text-sm"
            >
              <span className="text-primary-700 w-12 shrink-0 font-mono font-semibold">{abbr}</span>
              <span className="text-secondary-600">{expansion}</span>
            </button>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="border-secondary-100 text-secondary-400 border-t px-4 py-1 text-right text-xs">
          {charCount} characters
        </div>
      )}
    </div>
  );
}

export function SoapNotesEditor({ value, onChange, onAutoSave, readOnly = false }: Props) {
  const [activeTab, setActiveTab] = useState<keyof SoapNotes>('subjective');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dictation = useVoiceDictation();
  const { stop: stopDictation } = dictation;

  // Don't keep listening into a section the clinician can no longer see
  useEffect(() => {
    stopDictation();
  }, [activeTab, stopDictation]);
  const notesRef = useRef<SoapNotes>(value);
  notesRef.current = value;

  // Auto-save every 30 seconds
  useEffect(() => {
    if (readOnly || !onAutoSave) return;
    const interval = setInterval(() => {
      setAutoSaveStatus('saving');
      onAutoSave(notesRef.current);
      setTimeout(() => setAutoSaveStatus('saved'), 600);
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    }, 30_000);
    return () => clearInterval(interval);
  }, [readOnly, onAutoSave]);

  const handleTabChange = useCallback(
    (key: keyof SoapNotes, html: string) => {
      onChange({ ...notesRef.current, [key]: html });
    },
    [onChange]
  );

  return (
    <div className="border-secondary-200 overflow-hidden rounded-lg border">
      {/* Tab bar */}
      <div className="border-secondary-200 bg-secondary-50 flex border-b">
        {SOAP_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-primary-600 text-primary-700 border-b-2 bg-white'
                : 'text-secondary-600 hover:text-secondary-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab editor */}
      {SOAP_TABS.map((tab) => (
        <div key={tab.key} className={activeTab === tab.key ? 'block' : 'hidden'}>
          <SoapTabEditor
            sectionKey={tab.key}
            sectionLabel={tab.label.split(' — ')[1] ?? tab.label}
            dictation={readOnly ? undefined : dictation}
            content={value[tab.key] ?? ''}
            placeholder={tab.placeholder}
            onChange={(html) => handleTabChange(tab.key, html)}
            readOnly={readOnly}
          />
        </div>
      ))}

      {/* Dictation problems (permission denied, network, transcription failure) */}
      {!readOnly && dictation.error && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
        >
          <div>
            <p className="font-medium">{dictation.error}</p>
            {dictation.status === 'denied' && (
              <p className="text-xs text-red-700">
                To dictate, allow microphone access for this site in your browser’s address bar or
                site settings, then try again.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dictation.dismissError}
            className="shrink-0 text-xs font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Auto-save indicator */}
      {!readOnly && (
        <div className="border-secondary-100 bg-secondary-50 flex items-center justify-between border-t px-4 py-2">
          <div className="text-secondary-400 text-xs">
            {autoSaveStatus === 'saving' && <span className="text-yellow-600">Saving…</span>}
            {autoSaveStatus === 'saved' && <span className="text-green-600">Auto-saved</span>}
            {autoSaveStatus === 'idle' && <span>Auto-saves every 30s</span>}
          </div>
          {dictation.availability.available && (
            <span className="text-secondary-400 text-xs">
              Dictation expands shorthand automatically (e.g. “SOB” → “Shortness of breath”)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
