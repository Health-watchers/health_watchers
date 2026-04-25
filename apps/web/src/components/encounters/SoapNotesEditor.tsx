'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSuggestions } from '@/lib/medicalShorthand';

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
  { key: 'subjective' as const,  label: 'S — Subjective',  placeholder: "Patient's reported symptoms, complaints, and history…" },
  { key: 'objective' as const,   label: 'O — Objective',   placeholder: 'Physical examination findings, vitals, test results…' },
  { key: 'assessment' as const,  label: 'A — Assessment',  placeholder: "Doctor's clinical assessment and differential diagnosis…" },
  { key: 'plan' as const,        label: 'P — Plan',        placeholder: 'Treatment plan, medications, referrals, follow-up…' },
];

function EditorToolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-xs font-medium border transition-colors ${
      active
        ? 'bg-primary-600 text-white border-primary-600'
        : 'bg-white text-secondary-700 border-secondary-300 hover:bg-secondary-50'
    }`;

  return (
    <div className="flex flex-wrap gap-1 border-b border-secondary-200 bg-secondary-50 px-3 py-2">
      <button type="button" className={btn(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
      <button type="button" className={btn(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></button>
      <button type="button" className={btn(editor.isActive('underline'))}
        onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></button>
      <span className="mx-1 text-secondary-300">|</span>
      <button type="button" className={btn(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
      <button type="button" className={btn(editor.isActive('heading', { level: 3 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
      <span className="mx-1 text-secondary-300">|</span>
      <button type="button" className={btn(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
      <button type="button" className={btn(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
    </div>
  );
}

function SoapTabEditor({
  content, placeholder, onChange, readOnly,
}: {
  content: string; placeholder: string; onChange: (html: string) => void; readOnly?: boolean;
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
    ],
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
        setSuggestionPos({ top: coords.bottom - wrapper.top + 4, left: coords.left - wrapper.left });
      }
    },
    onBlur() { setSuggestions([]); },
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
    editor.chain().focus()
      .deleteRange({ from: from - lastWord.length, to: from })
      .insertContent(expansion)
      .run();
    setSuggestions([]);
  };

  const charCount = editor?.storage.characterCount?.characters() ?? 0;

  return (
    <div ref={wrapperRef} className="relative">
      {editor && !readOnly && <EditorToolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none min-h-[140px] px-4 py-3 focus-within:outline-none"
      />
      {/* Shorthand autocomplete dropdown */}
      {suggestions.length > 0 && (
        <div
          className="absolute z-50 rounded-md border border-secondary-200 bg-white shadow-lg"
          style={{ top: suggestionPos.top, left: suggestionPos.left }}
        >
          {suggestions.map(({ abbr, expansion }) => (
            <button
              key={abbr}
              type="button"
              onMouseDown={e => { e.preventDefault(); applySuggestion(expansion); }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-primary-50"
            >
              <span className="font-mono font-semibold text-primary-700 w-12 shrink-0">{abbr}</span>
              <span className="text-secondary-600">{expansion}</span>
            </button>
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="border-t border-secondary-100 px-4 py-1 text-right text-xs text-secondary-400">
          {charCount} characters
        </div>
      )}
    </div>
  );
}

export function SoapNotesEditor({ value, onChange, onAutoSave, readOnly = false }: Props) {
  const [activeTab, setActiveTab] = useState<keyof SoapNotes>('subjective');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
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

  const handleTabChange = useCallback((key: keyof SoapNotes, html: string) => {
    onChange({ ...notesRef.current, [key]: html });
  }, [onChange]);

  return (
    <div className="rounded-lg border border-secondary-200 overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-secondary-200 bg-secondary-50">
        {SOAP_TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-primary-600 bg-white text-primary-700'
                : 'text-secondary-600 hover:text-secondary-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab editor */}
      {SOAP_TABS.map(tab => (
        <div key={tab.key} className={activeTab === tab.key ? 'block' : 'hidden'}>
          <SoapTabEditor
            content={value[tab.key] ?? ''}
            placeholder={tab.placeholder}
            onChange={html => handleTabChange(tab.key, html)}
            readOnly={readOnly}
          />
        </div>
      ))}

      {/* Auto-save indicator + voice stub */}
      {!readOnly && (
        <div className="flex items-center justify-between border-t border-secondary-100 bg-secondary-50 px-4 py-2">
          <div className="text-xs text-secondary-400">
            {autoSaveStatus === 'saving' && <span className="text-yellow-600">Saving…</span>}
            {autoSaveStatus === 'saved'  && <span className="text-green-600">Auto-saved</span>}
            {autoSaveStatus === 'idle'   && <span>Auto-saves every 30s</span>}
          </div>
          {/* TODO: Implement voice-to-text using Web Speech API or transcription service */}
          <button
            type="button"
            title="Voice to text (coming soon)"
            disabled
            className="flex items-center gap-1.5 rounded-md border border-secondary-200 px-3 py-1 text-xs text-secondary-400 opacity-50 cursor-not-allowed"
          >
            🎤 Voice
          </button>
        </div>
      )}
    </div>
  );
}
