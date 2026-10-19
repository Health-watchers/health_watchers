'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  createRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getSuggestions } from '@/lib/medicalShorthand';

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
  /** Pass the server's lastUpdatedAt ISO string for conflict detection */
  serverLastUpdatedAt?: string;
  /** Provide recent patients / encounters for @mention suggestions */
  mentionItems?: MentionItem[];
  /** Current encounter id — used to detect remote changes */
  encounterId?: string;
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
// EditorToolbar
// ---------------------------------------------------------------------------

interface EditorToolbarProps {
  editor: Editor;
  onSave?: () => void;
}

function EditorToolbar({ editor, onSave }: EditorToolbarProps) {
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
      <span className="text-secondary-300 mx-1">|</span>

      <button
        type="button"
        aria-label="Blockquote"
        title="Blockquote"
        className={btn(editor.isActive('blockquote'))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </button>

      {onSave !== undefined && (
        <>
          <span className="text-secondary-300 mx-1">|</span>
          <button
            type="button"
            aria-label="Save (Ctrl+S)"
            title="Save (Ctrl+S)"
            className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
            onClick={onSave}
          >
            💾 Save
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MentionList — keyboard-navigable list rendered in a floating container
// ---------------------------------------------------------------------------

interface MentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList(
  { items, command },
  ref
) {
  const [selected, setSelected] = useState(0);

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="border-secondary-200 text-secondary-500 rounded-md border bg-white p-2 text-xs shadow-lg">
        No matches
      </div>
    );
  }

  return (
    <div className="border-secondary-200 max-h-48 overflow-y-auto rounded-md border bg-white shadow-lg">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            command(item);
          }}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            i === selected
              ? 'bg-primary-50 text-primary-700'
              : 'text-secondary-700 hover:bg-secondary-50'
          }`}
        >
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
              item.type === 'patient' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {item.type === 'patient' ? 'PT' : 'ENC'}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Build Mention Tiptap extension with a fixed-position React portal popup
// ---------------------------------------------------------------------------

function buildMentionExtension(allItems: MentionItem[]) {
  return Mention.configure({
    HTMLAttributes: {
      class:
        'inline-flex items-center rounded bg-primary-50 px-1 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-primary-200',
    },
    suggestion: {
      items: ({ query }: { query: string }) =>
        allItems
          .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 10),

      render: () => {
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;z-index:9999;min-width:200px;max-width:320px;';
        document.body.appendChild(container);

        const listRef = createRef<MentionListHandle>();
        let root: Root | null = null;

        return {
          onStart(props: {
            clientRect?: (() => DOMRect | null) | null;
            items: MentionItem[];
            command: (item: MentionItem) => void;
          }) {
            const rect = props.clientRect?.();
            if (rect) {
              container.style.top = `${rect.bottom + 4}px`;
              container.style.left = `${rect.left}px`;
            }
            root = createRoot(container);
            root.render(<MentionList ref={listRef} items={props.items} command={props.command} />);
          },

          onUpdate(props: {
            clientRect?: (() => DOMRect | null) | null;
            items: MentionItem[];
            command: (item: MentionItem) => void;
          }) {
            const rect = props.clientRect?.();
            if (rect) {
              container.style.top = `${rect.bottom + 4}px`;
              container.style.left = `${rect.left}px`;
            }
            root?.render(<MentionList ref={listRef} items={props.items} command={props.command} />);
          },

          onKeyDown(props: { event: KeyboardEvent }) {
            if (props.event.key === 'Escape') {
              container.style.display = 'none';
              return true;
            }
            return listRef.current?.onKeyDown(props) ?? false;
          },

          onExit() {
            root?.unmount();
            container.remove();
          },
        };
      },
    },
  });
}

// ---------------------------------------------------------------------------
// SoapTabEditor — one rich-text editor per SOAP tab
// ---------------------------------------------------------------------------

interface SoapTabEditorProps {
  content: string;
  placeholder: string;
  onChange: (html: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  mentionItems?: MentionItem[];
}

function SoapTabEditor({
  content,
  placeholder,
  onChange,
  onSave,
  readOnly,
  mentionItems = [],
}: SoapTabEditorProps) {
  const [suggestions, setSuggestions] = useState<Array<{ abbr: string; expansion: string }>>([]);
  const [suggestionPos, setSuggestionPos] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      CharacterCount,
      Placeholder.configure({ placeholder }),
      buildMentionExtension(mentionItems),
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
        // Ctrl/Cmd+S → trigger save
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
          event.preventDefault();
          onSave?.();
          return true;
        }
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

  const charCount = editor?.storage.characterCount?.characters() ?? 0;

  return (
    <div ref={wrapperRef} className="relative">
      {editor !== null && !readOnly && (
        <EditorToolbar editor={editor} {...(onSave !== undefined ? { onSave } : {})} />
      )}
      <EditorContent
        editor={editor}
        className="prose prose-sm min-h-[140px] max-w-none px-4 py-3 focus-within:outline-none"
      />

      {/* Medical shorthand autocomplete dropdown */}
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
// VoiceTranscription — Web Speech API (browser-only)
// ---------------------------------------------------------------------------

// Web Speech API type declarations (not in standard TS lib)
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative | undefined;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult | undefined;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

// Extend Window for cross-browser SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface VoiceTranscriptionProps {
  onTranscript: (text: string) => void;
}

function VoiceTranscription({ onTranscript }: VoiceTranscriptionProps) {
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalRef = useRef('');

  const isSupported =
    typeof window !== 'undefined' &&
    (window.SpeechRecognition !== undefined || window.webkitSpeechRecognition !== undefined);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setVoiceError('Speech recognition not supported in this browser.');
      return;
    }
    setVoiceError(null);
    finalRef.current = '';

    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (SpeechRecognitionCtor === undefined) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result !== undefined && result.isFinal) {
          const alt = result[0];
          if (alt !== undefined) {
            finalRef.current += alt.transcript + ' ';
          }
        } else if (result !== undefined) {
          const alt = result[0];
          if (alt !== undefined) {
            interim += alt.transcript;
          }
        }
      }
      onTranscript(finalRef.current + interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setVoiceError(`Voice error: ${event.error}`);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [isSupported, onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {voiceError !== null && <span className="text-xs text-red-500">{voiceError}</span>}
      <button
        type="button"
        title={
          !isSupported
            ? 'Voice transcription not supported in this browser'
            : listening
              ? 'Stop recording'
              : 'Start voice transcription (populates current tab)'
        }
        disabled={!isSupported}
        onClick={listening ? stopListening : startListening}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
          listening
            ? 'animate-pulse border-red-300 bg-red-50 text-red-700'
            : isSupported
              ? 'border-secondary-200 text-secondary-600 hover:border-secondary-300 hover:bg-secondary-50'
              : 'border-secondary-200 text-secondary-400 cursor-not-allowed opacity-50'
        }`}
      >
        🎤 {listening ? 'Stop' : 'Voice'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConflictBanner — shown when a remote edit is detected
// ---------------------------------------------------------------------------

function ConflictBanner({ onReload, onDismiss }: { onReload: () => void; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-yellow-50 px-4 py-2 text-sm text-yellow-800 ring-1 ring-yellow-300"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>
          <strong>Conflict detected —</strong> this encounter was edited by another user. Reload to
          get the latest version or continue editing to overwrite.
        </span>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={onReload}
          className="rounded bg-yellow-600 px-2 py-1 text-xs font-medium text-white hover:bg-yellow-700"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded border border-yellow-400 px-2 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main SoapNotesEditor
// ---------------------------------------------------------------------------

export function SoapNotesEditor({
  value,
  onChange,
  onAutoSave,
  readOnly = false,
  serverLastUpdatedAt,
  mentionItems = [],
  encounterId,
}: Props) {
  const [activeTab, setActiveTab] = useState<keyof SoapNotes>('subjective');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [conflictDetected, setConflictDetected] = useState(false);
  const notesRef = useRef<SoapNotes>(value);
  notesRef.current = value;

  // Track the server timestamp we started editing with
  const serverTsRef = useRef<string | undefined>(serverLastUpdatedAt);
  useEffect(() => {
    serverTsRef.current = serverLastUpdatedAt;
  }, [serverLastUpdatedAt]);

  // ------------------------------------------------------------------
  // Save helper — used by auto-save timer and Ctrl+S
  // ------------------------------------------------------------------
  const triggerSave = useCallback(() => {
    if (onAutoSave === undefined) return;
    setAutoSaveStatus('saving');
    onAutoSave(notesRef.current);
    setTimeout(() => setAutoSaveStatus('saved'), 600);
    setTimeout(() => setAutoSaveStatus('idle'), 3000);
  }, [onAutoSave]);

  // Auto-save interval (every 30 seconds)
  useEffect(() => {
    if (readOnly || onAutoSave === undefined) return;
    const interval = setInterval(triggerSave, 30_000);
    return () => clearInterval(interval);
  }, [readOnly, onAutoSave, triggerSave]);

  // ------------------------------------------------------------------
  // Conflict detection — poll the API every 60 s via HEAD request
  // ------------------------------------------------------------------
  useEffect(() => {
    if (readOnly || encounterId === undefined || serverLastUpdatedAt === undefined) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/encounters/${encodeURIComponent(encounterId)}`, {
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

  // ------------------------------------------------------------------
  // Tab helpers
  // ------------------------------------------------------------------
  const handleTabChange = useCallback(
    (key: keyof SoapNotes, html: string) => {
      onChange({ ...notesRef.current, [key]: html });
    },
    [onChange]
  );

  // ------------------------------------------------------------------
  // Voice transcript → append to active tab as new paragraph
  // ------------------------------------------------------------------
  const handleVoiceTranscript = useCallback(
    (text: string) => {
      const existing = notesRef.current[activeTab] ?? '';
      const appended = existing !== '' ? `${existing}<p>${text}</p>` : `<p>${text}</p>`;
      onChange({ ...notesRef.current, [activeTab]: appended });
    },
    [activeTab, onChange]
  );

  return (
    <div className="space-y-2">
      {/* Conflict banner */}
      {conflictDetected && !readOnly && (
        <ConflictBanner
          onReload={() => window.location.reload()}
          onDismiss={() => setConflictDetected(false)}
        />
      )}

      <div className="border-secondary-200 overflow-hidden rounded-lg border">
        {/* SOAP tab bar */}
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

        {/* Editors — all mounted, inactive ones are hidden to preserve state */}
        {SOAP_TABS.map((tab) => (
          <div key={tab.key} className={activeTab === tab.key ? 'block' : 'hidden'}>
            <SoapTabEditor
              content={value[tab.key] ?? ''}
              placeholder={tab.placeholder}
              onChange={(html) => handleTabChange(tab.key, html)}
              onSave={triggerSave}
              readOnly={readOnly}
              mentionItems={mentionItems}
            />
          </div>
        ))}

        {/* Footer: auto-save status + voice transcription button */}
        {!readOnly && (
          <div className="border-secondary-100 bg-secondary-50 flex items-center justify-between border-t px-4 py-2">
            <div className="text-xs">
              {autoSaveStatus === 'saving' && (
                <span className="flex items-center gap-1.5 text-yellow-600">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
                  Saving…
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="flex items-center gap-1.5 text-green-600">
                  <span>✓</span> Saved
                </span>
              )}
              {autoSaveStatus === 'idle' && (
                <span className="text-secondary-400">
                  Auto-saves every 30 s · Ctrl+S to save now · @ to mention
                </span>
              )}
            </div>

            <VoiceTranscription onTranscript={handleVoiceTranscript} />
          </div>
        )}
      </div>
    </div>
  );
}
