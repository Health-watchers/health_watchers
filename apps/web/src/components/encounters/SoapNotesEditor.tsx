'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSuggestions, expandShorthandInText } from '@/lib/medicalShorthand';
import { useVoiceDictation, type VoiceDictation } from '@/hooks/useVoiceDictation';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { UnsavedChangesModal } from '@/components/UnsavedChangesModal';
import { API_V1 } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SoapNotes {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

export interface MentionItem {
  id: string;
  label: string;
  type: 'patient' | 'encounter';
}

interface Props {
  value: SoapNotes;
  onChange: (notes: SoapNotes) => void;
  /** Called on auto-save (every 30 s) and on Ctrl+S */
  onAutoSave?: (notes: SoapNotes) => void;
  readOnly?: boolean;
  /** Items (patients + encounters) for @mention dropdown */
  mentionItems?: MentionItem[];
  /** ISO timestamp of last server update — used for conflict detection */
  serverLastUpdatedAt?: string;
  /** Encounter ID for conflict detection polling */
  encounterId?: string;
  /** Called with true the first time the user edits any SOAP section */
  onDirtyChange?: (isDirty: boolean) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Mention rendering helpers
// ---------------------------------------------------------------------------

/**
 * Builds a Tiptap Mention extension configured with our item list.
 * Uses a vanilla DOM popup (no tippy.js dependency needed at runtime)
 * for the suggestion dropdown.
 */
function buildMentionExtension(items: MentionItem[]) {
  return Mention.configure({
    HTMLAttributes: {
      class: 'mention-tag',
    },
    suggestion: {
      items: ({ query }: { query: string }): MentionItem[] => {
        const q = query.toLowerCase();
        return items.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 8);
      },
      // Use `any` for render props — Tiptap's SuggestionProps generics don't
      // match our MentionItem type and fighting the types adds no value here.
      render: () => {
        let popup: HTMLDivElement | null = null;

        const buildPopup = (
          suggestionItems: MentionItem[],
          onSelect: (item: MentionItem) => void
        ) => {
          if (popup) popup.remove();
          popup = document.createElement('div');
          popup.className =
            'mention-dropdown border-secondary-200 fixed z-[9999] max-h-60 overflow-auto rounded-md border bg-white shadow-lg';

          if (suggestionItems.length === 0) {
            popup.innerHTML =
              '<div class="px-3 py-2 text-sm text-secondary-400">No matches found</div>';
          } else {
            suggestionItems.forEach((item) => {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className =
                'hover:bg-primary-50 flex w-full items-center gap-3 px-3 py-2 text-left text-sm';
              btn.innerHTML = `
                <span class="text-xs font-bold ${item.type === 'patient' ? 'text-blue-600' : 'text-green-600'}">
                  ${item.type === 'patient' ? 'PT' : 'ENC'}
                </span>
                <span class="text-secondary-700">${item.label}</span>
              `;
              btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                onSelect(item);
              });
              popup!.appendChild(btn);
            });
          }

          document.body.appendChild(popup);
        };

        const positionPopup = (clientRect: DOMRect) => {
          if (!popup) return;
          popup.style.top = `${clientRect.bottom + 4}px`;
          popup.style.left = `${clientRect.left}px`;
        };

        return {
          onStart: (props: any) => {
            buildPopup(props.items as MentionItem[], (item: MentionItem) => {
              props.command({ id: item.id, label: item.label, type: item.type });
            });
            const rect = props.clientRect() as DOMRect | null;
            if (rect) positionPopup(rect);
          },
          onUpdate: (props: any) => {
            buildPopup(props.items as MentionItem[], (item: MentionItem) => {
              props.command({ id: item.id, label: item.label, type: item.type });
            });
            const rect = props.clientRect() as DOMRect | null;
            if (rect) positionPopup(rect);
          },
          onKeyDown: (props: any) => {
            if (props.event.key === 'Escape' && popup) {
              popup.remove();
              return true;
            }
            return false;
          },
          onExit: () => {
            if (popup) {
              popup.remove();
              popup = null;
            }
          },
        };
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function EditorToolbar({ editor }: { editor: Editor }) {
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
        aria-label="Bold (Ctrl+B)"
        title="Bold (Ctrl+B)"
        className={btn(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        aria-label="Italic"
        title="Italic"
        className={btn(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        aria-label="Underline"
        title="Underline"
        className={btn(editor.isActive('underline'))}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </button>
      <button
        type="button"
        aria-label="Strikethrough"
        title="Strikethrough"
        className={btn(editor.isActive('strike'))}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <s>S</s>
      </button>
      <span className="text-secondary-300 mx-1">|</span>

      <button
        type="button"
        aria-label="Heading 2"
        title="Heading 2"
        className={btn(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </button>
      <button
        type="button"
        aria-label="Heading 3"
        title="Heading 3"
        className={btn(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </button>
      <span className="text-secondary-300 mx-1">|</span>

      <button
        type="button"
        aria-label="Bullet list"
        title="Bullet list"
        className={btn(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </button>
      <button
        type="button"
        aria-label="Ordered list"
        title="Ordered list"
        className={btn(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </button>
      <button
        type="button"
        aria-label="Quote"
        title="Block quote"
        className={btn(editor.isActive('blockquote'))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dictation button
// ---------------------------------------------------------------------------

function formatElapsed(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
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

  if (!availability.available) {
    return (
      <span className="ml-auto inline-flex" title={availability.reason}>
        <button
          type="button"
          disabled
          className="border-secondary-300 text-secondary-400 flex cursor-not-allowed items-center gap-1 rounded border bg-white px-2 py-1 text-xs opacity-60"
        >
          <MicIcon /> Dictate
        </button>
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
          ? 'Recording is transcribed by your clinic\u2019s AI service when you stop'
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

// ---------------------------------------------------------------------------
// Per-tab editor
// ---------------------------------------------------------------------------

function SoapTabEditor({
  sectionKey,
  sectionLabel,
  content,
  placeholder,
  onChange,
  onSave,
  readOnly,
  dictation,
  mentionItems,
}: {
  sectionKey: string;
  sectionLabel: string;
  content: string;
  placeholder: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  dictation?: VoiceDictation;
  mentionItems?: MentionItem[];
}) {
  const [suggestions, setSuggestions] = useState<Array<{ abbr: string; expansion: string }>>([]);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      CharacterCount,
      Placeholder.configure({ placeholder }),
      buildMentionExtension(mentionItems ?? []),
    ],
    content,
    editable: !readOnly,
    onUpdate({ editor: e }) {
      onChange(e.getHTML());

      // Medical shorthand autocomplete
      const { from } = e.state.selection;
      const text = e.state.doc.textBetween(Math.max(0, from - 20), from, ' ');
      const lastWord = text.split(/\s/).pop() ?? '';
      const matches = getSuggestions(lastWord);
      setSuggestions(matches);

      if (matches.length > 0) {
        const coords = e.view.coordsAtPos(from);
        const wrapper = wrapperRef.current?.getBoundingClientRect();
        if (wrapper) {
          setSuggestionPos({
            top: coords.bottom - wrapper.top + 4,
            left: coords.left - wrapper.left,
          });
        }
      }
    },
    onBlur() {
      setSuggestions([]);
    },
    editorProps: {
      handleKeyDown(_view, event) {
        // Ctrl/Cmd+S → trigger immediate save
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          onSave?.();
          return true;
        }
        // Ctrl+B and Ctrl+I are handled natively by Tiptap StarterKit
        return false;
      },
    },
  });

  // Sync external content changes (e.g. template load or voice transcript)
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

  // Dictated text inserted at cursor as plain text (never parsed as HTML)
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
      {editor && !readOnly && <EditorToolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className="prose prose-sm min-h-[140px] max-w-none px-4 py-3 focus-within:outline-none"
      />

      {/* Dictation live indicator */}
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

      {/* Dictation button row */}
      {editor && !readOnly && dictation && (
        <div className="border-secondary-100 flex items-center border-t px-3 py-2">
          <DictationButton
            sectionKey={sectionKey}
            sectionLabel={sectionLabel}
            dictation={dictation}
            onFinal={insertDictation}
          />
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

// ---------------------------------------------------------------------------
// Main editor component
// ---------------------------------------------------------------------------

export function SoapNotesEditor({
  value,
  onChange,
  onAutoSave,
  readOnly = false,
  mentionItems,
  serverLastUpdatedAt,
  encounterId,
  onDirtyChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<keyof SoapNotes>('subjective');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [conflictDetected, setConflictDetected] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const dictation = useVoiceDictation();
  const { stop: stopDictation } = dictation;

  const notesRef = useRef<SoapNotes>(value);
  notesRef.current = value;

  // Track server timestamp for conflict detection
  const serverTsRef = useRef<string | undefined>(serverLastUpdatedAt);
  useEffect(() => {
    serverTsRef.current = serverLastUpdatedAt;
  }, [serverLastUpdatedAt]);

  const { showModal, confirmLeave, cancelLeave } = useUnsavedChangesGuard(
    isDirty && !readOnly,
    'You have unsaved SOAP notes. Are you sure you want to leave?'
  );

  // Stop dictation when switching tabs
  useEffect(() => {
    stopDictation();
  }, [activeTab, stopDictation]);

  // ── Save helper (used by auto-save timer and Ctrl+S) ──────────────────────
  const triggerSave = useCallback(() => {
    if (onAutoSave === undefined) return;
    setAutoSaveStatus('saving');
    onAutoSave(notesRef.current);
    setIsDirty(false);
    onDirtyChange?.(false);
    setTimeout(() => setAutoSaveStatus('saved'), 600);
    setTimeout(() => setAutoSaveStatus('idle'), 3000);
  }, [onAutoSave, onDirtyChange]);

  // ── Auto-save interval (every 30 seconds) ────────────────────────────────
  useEffect(() => {
    if (readOnly || !onAutoSave) return;
    const interval = setInterval(() => {
      setAutoSaveStatus('saving');
      onAutoSave(notesRef.current);
      setIsDirty(false);
      onDirtyChange?.(false);
      setTimeout(() => setAutoSaveStatus('saved'), 600);
      setTimeout(() => setAutoSaveStatus('idle'), 3000);
    }, 30_000);
    return () => clearInterval(interval);
  }, [readOnly, onAutoSave, onDirtyChange]);

  // ── Conflict detection — poll every 60 s via HEAD request ─────────────────
  useEffect(() => {
    if (readOnly || encounterId === undefined || serverLastUpdatedAt === undefined) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_V1}/encounters/${encodeURIComponent(encounterId)}`, {
          method: 'HEAD',
          credentials: 'include',
        });
        const remoteTs = res.headers.get('x-last-updated-at') ?? res.headers.get('last-modified');
        const currentTs = serverTsRef.current;
        if (remoteTs !== null && currentTs !== undefined) {
          if (new Date(remoteTs).getTime() > new Date(currentTs).getTime()) {
            setConflictDetected(true);
          }
        }
      } catch {
        // Ignore network errors during polling
      }
    };

    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, [readOnly, encounterId, serverLastUpdatedAt]);

  // ── Tab change handler ────────────────────────────────────────────────────
  const handleTabChange = useCallback(
    (key: keyof SoapNotes, html: string) => {
      onChange({ ...notesRef.current, [key]: html });
      if (!isDirty) {
        setIsDirty(true);
        onDirtyChange?.(true);
      }
    },
    [onChange, isDirty, onDirtyChange]
  );

  return (
    <>
      <div className="border-secondary-200 overflow-hidden rounded-lg border">
        {/* Conflict warning banner */}
        {conflictDetected && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800"
          >
            <svg
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
              />
            </svg>
            <span className="font-medium">
              This encounter was modified by another user. Your changes may conflict.
            </span>
            <button
              type="button"
              onClick={() => setConflictDetected(false)}
              className="ml-auto text-xs font-medium underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

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
              {...(readOnly ? {} : { dictation })}
              content={value[tab.key] ?? ''}
              placeholder={tab.placeholder}
              onChange={(html) => handleTabChange(tab.key, html)}
              onSave={triggerSave}
              readOnly={readOnly}
              {...(mentionItems ? { mentionItems } : {})}
            />
          </div>
        ))}

        {/* Dictation error display */}
        {!readOnly && dictation.error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
          >
            <div>
              <p className="font-medium">{dictation.error}</p>
              {dictation.status === 'denied' && (
                <p className="text-xs text-red-700">
                  To dictate, allow microphone access for this site in your browser&rsquo;s address
                  bar or site settings, then try again.
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
              {autoSaveStatus === 'idle' && <span>Auto-saves every 30s · Ctrl+S to save now</span>}
            </div>
            {dictation.availability.available && (
              <span className="text-secondary-400 text-xs">
                Dictation expands shorthand automatically (e.g. &ldquo;SOB&rdquo; → &ldquo;Shortness
                of breath&rdquo;)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Unsaved Changes Modal */}
      {!readOnly && (
        <UnsavedChangesModal isOpen={showModal} onConfirm={confirmLeave} onCancel={cancelLeave} />
      )}
    </>
  );
}
