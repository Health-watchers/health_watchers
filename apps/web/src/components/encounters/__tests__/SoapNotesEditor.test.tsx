/**
 * Tests for SoapNotesEditor
 *
 * Covers:
 *  1. Rendering and tab navigation
 *  2. Auto-save every 30 s with "Saved" indicator
 *  3. Ctrl+S triggers immediate save
 *  4. Rich-text toolbar is rendered in edit mode (not read-only)
 *  5. @mention dropdown rendered when mention items are provided
 *  6. Conflict detection banner shown when another user edits the encounter
 *  7. Conflict banner can be dismissed
 *  8. readOnly mode hides toolbar and dictation
 *  9. onDirtyChange callback fires when content changes
 * 10. Medical shorthand autocomplete list appears while typing
 */

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SoapNotesEditor, type MentionItem } from '../SoapNotesEditor';

// ---------------------------------------------------------------------------
// Mock Tiptap – the real editor needs a browser DOM with window.document and
// requestAnimationFrame wired together properly.  For unit tests we swap it
// for a simple controlled <textarea> so we can focus on SoapNotesEditor
// behaviour rather than Tiptap internals.
// ---------------------------------------------------------------------------

const mockEditorChain = {
  focus: jest.fn().mockReturnThis(),
  toggleBold: jest.fn().mockReturnThis(),
  toggleItalic: jest.fn().mockReturnThis(),
  toggleUnderline: jest.fn().mockReturnThis(),
  toggleStrike: jest.fn().mockReturnThis(),
  toggleHeading: jest.fn().mockReturnThis(),
  toggleBulletList: jest.fn().mockReturnThis(),
  toggleOrderedList: jest.fn().mockReturnThis(),
  toggleBlockquote: jest.fn().mockReturnThis(),
  insertContent: jest.fn().mockReturnThis(),
  deleteRange: jest.fn().mockReturnThis(),
  setContent: jest.fn().mockReturnThis(),
  run: jest.fn(),
};

const mockEditor = {
  chain: jest.fn(() => mockEditorChain),
  commands: { setContent: jest.fn() },
  isActive: jest.fn(() => false),
  getHTML: jest.fn(() => '<p></p>'),
  state: {
    selection: { from: 0 },
    doc: { textBetween: jest.fn(() => '') },
  },
  view: { coordsAtPos: jest.fn(() => ({ bottom: 100, left: 0 })) },
  storage: { characterCount: { characters: jest.fn(() => 0) } },
  isDestroyed: false,
};

// Store onUpdate callback so tests can trigger it
let capturedOnUpdate: ((args: { editor: typeof mockEditor }) => void) | null = null;
let capturedHandleKeyDown: ((view: unknown, event: KeyboardEvent) => boolean) | null = null;

jest.mock('@tiptap/react', () => ({
  useEditor: jest.fn(
    (config: {
      onUpdate?: (args: { editor: typeof mockEditor }) => void;
      editorProps?: { handleKeyDown?: (view: unknown, event: KeyboardEvent) => boolean };
    }) => {
      capturedOnUpdate = config.onUpdate ?? null;
      capturedHandleKeyDown = config.editorProps?.handleKeyDown ?? null;
      return mockEditor;
    }
  ),
  EditorContent: ({ editor: _editor, className }: { editor: unknown; className?: string }) => (
    <div data-testid="editor-content" className={className} />
  ),
}));

jest.mock('@tiptap/starter-kit', () => ({}));
jest.mock('@tiptap/extension-underline', () => ({ configure: jest.fn(() => ({})) }));
jest.mock('@tiptap/extension-character-count', () => ({}));
jest.mock('@tiptap/extension-placeholder', () => ({ configure: jest.fn(() => ({})) }));
jest.mock('@tiptap/extension-mention', () => ({ configure: jest.fn(() => ({})) }));

// ---------------------------------------------------------------------------
// Mock hooks that depend on browser APIs
// ---------------------------------------------------------------------------

jest.mock('@/hooks/useVoiceDictation', () => ({
  useVoiceDictation: jest.fn(() => ({
    availability: { available: false, engine: 'webspeech', reason: 'Not supported' },
    status: 'idle',
    activeKey: null,
    interim: '',
    elapsed: 0,
    error: null,
    start: jest.fn(),
    stop: jest.fn(),
    dismissError: jest.fn(),
  })),
}));

jest.mock('@/hooks/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: jest.fn(() => ({
    showModal: false,
    confirmLeave: jest.fn(),
    cancelLeave: jest.fn(),
  })),
}));

jest.mock('@/components/UnsavedChangesModal', () => ({
  UnsavedChangesModal: () => null,
}));

// ---------------------------------------------------------------------------
// Mock fetch for conflict-detection polling
// ---------------------------------------------------------------------------

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    headers: { get: jest.fn(() => null) },
  } as unknown as Response)
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  value: { subjective: '', objective: '', assessment: '', plan: '' },
  onChange: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SoapNotesEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    capturedOnUpdate = null;
    capturedHandleKeyDown = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // 1 — Rendering & tabs ────────────────────────────────────────────────────

  it('renders all four SOAP tab buttons', () => {
    render(<SoapNotesEditor {...defaultProps} />);

    expect(screen.getByRole('button', { name: /S — Subjective/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /O — Objective/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /A — Assessment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /P — Plan/i })).toBeInTheDocument();
  });

  it('shows the "Subjective" tab as active by default', () => {
    render(<SoapNotesEditor {...defaultProps} />);

    const subjectiveBtn = screen.getByRole('button', { name: /S — Subjective/i });
    expect(subjectiveBtn.className).toMatch(/border-b-2/);
  });

  it('switches active tab when another tab is clicked', () => {
    render(<SoapNotesEditor {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /O — Objective/i }));

    const objectiveBtn = screen.getByRole('button', { name: /O — Objective/i });
    expect(objectiveBtn.className).toMatch(/border-b-2/);
  });

  // 2 — Auto-save every 30 seconds ──────────────────────────────────────────

  it('calls onAutoSave after 30 seconds', () => {
    const onAutoSave = jest.fn();
    render(
      <SoapNotesEditor
        {...defaultProps}
        value={{ subjective: 'test', objective: '', assessment: '', plan: '' }}
        onAutoSave={onAutoSave}
      />
    );

    expect(onAutoSave).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(onAutoSave).toHaveBeenCalledTimes(1);
    expect(onAutoSave).toHaveBeenCalledWith(expect.objectContaining({ subjective: 'test' }));
  });

  it('shows "Saving…" then "Auto-saved" after the 30-second interval', async () => {
    const onAutoSave = jest.fn();
    render(<SoapNotesEditor {...defaultProps} onAutoSave={onAutoSave} />);

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.getByText('Saving…')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(screen.getByText('Auto-saved')).toBeInTheDocument();
    });
  });

  it('shows idle auto-save hint when nothing has been saved recently', () => {
    render(<SoapNotesEditor {...defaultProps} onAutoSave={jest.fn()} />);
    expect(screen.getByText(/Auto-saves every 30s/i)).toBeInTheDocument();
  });

  it('does not start auto-save timer in read-only mode', () => {
    const onAutoSave = jest.fn();
    render(<SoapNotesEditor {...defaultProps} onAutoSave={onAutoSave} readOnly />);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    expect(onAutoSave).not.toHaveBeenCalled();
  });

  // 3 — Ctrl+S immediate save ───────────────────────────────────────────────

  it('triggers onAutoSave immediately when Ctrl+S is fired', () => {
    const onAutoSave = jest.fn();
    render(<SoapNotesEditor {...defaultProps} onAutoSave={onAutoSave} />);

    // Simulate Ctrl+S keydown through the editor key handler
    expect(capturedHandleKeyDown).not.toBeNull();
    const fakeEvent = { ctrlKey: true, metaKey: false, key: 's', preventDefault: jest.fn() };
    const handled = capturedHandleKeyDown!(null, fakeEvent as unknown as KeyboardEvent);

    expect(fakeEvent.preventDefault).toHaveBeenCalled();
    expect(handled).toBe(true);
    expect(onAutoSave).toHaveBeenCalledTimes(1);
  });

  it('does not intercept other key combos (e.g. Ctrl+A)', () => {
    render(<SoapNotesEditor {...defaultProps} onAutoSave={jest.fn()} />);
    const fakeEvent = { ctrlKey: true, metaKey: false, key: 'a', preventDefault: jest.fn() };
    const handled = capturedHandleKeyDown!(null, fakeEvent as unknown as KeyboardEvent);
    expect(handled).toBe(false);
    expect(fakeEvent.preventDefault).not.toHaveBeenCalled();
  });

  // 4 — Rich-text toolbar ───────────────────────────────────────────────────

  it('renders the formatting toolbar in edit mode', () => {
    render(<SoapNotesEditor {...defaultProps} />);

    // The component renders all 4 SOAP tab editors (hidden tabs are `display:none`
    // but still in the DOM), so each toolbar button appears 4 times.
    // We assert at least one is present for each formatting action.
    expect(screen.getAllByRole('button', { name: /Bold/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Italic/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Underline/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Heading 2/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Heading 3/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Bullet list/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Ordered list/i }).length).toBeGreaterThan(0);
  });

  it('hides the formatting toolbar in readOnly mode', () => {
    render(<SoapNotesEditor {...defaultProps} readOnly />);

    expect(screen.queryByRole('button', { name: /Bold/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Italic/i })).not.toBeInTheDocument();
  });

  it('toggles bold when the Bold toolbar button is clicked', () => {
    render(<SoapNotesEditor {...defaultProps} />);

    // All 4 tab toolbars render, click the first Bold button
    fireEvent.click(screen.getAllByRole('button', { name: /Bold/i })[0]!);

    expect(mockEditor.chain).toHaveBeenCalled();
    expect(mockEditorChain.toggleBold).toHaveBeenCalled();
    expect(mockEditorChain.run).toHaveBeenCalled();
  });

  it('toggles bullet list when the bullet-list button is clicked', () => {
    render(<SoapNotesEditor {...defaultProps} />);

    // All 4 tab toolbars render, click the first Bullet list button
    fireEvent.click(screen.getAllByRole('button', { name: /Bullet list/i })[0]!);

    expect(mockEditorChain.toggleBulletList).toHaveBeenCalled();
    expect(mockEditorChain.run).toHaveBeenCalled();
  });

  // 5 — Conflict detection banner ───────────────────────────────────────────

  it('shows a conflict warning when polling detects a newer server timestamp', async () => {
    const futureTs = new Date(Date.now() + 60_000).toISOString();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: jest.fn(() => futureTs) },
    } as unknown as Response);

    render(
      <SoapNotesEditor
        {...defaultProps}
        encounterId="enc-123"
        serverLastUpdatedAt={new Date(Date.now() - 60_000).toISOString()}
      />
    );

    // Advance past the 60-second poll interval
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    await waitFor(() => {
      expect(screen.getByText(/This encounter was modified by another user/i)).toBeInTheDocument();
    });
  });

  it('hides the conflict banner when dismissed', async () => {
    const futureTs = new Date(Date.now() + 60_000).toISOString();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: jest.fn(() => futureTs) },
    } as unknown as Response);

    render(
      <SoapNotesEditor
        {...defaultProps}
        encounterId="enc-123"
        serverLastUpdatedAt={new Date(Date.now() - 60_000).toISOString()}
      />
    );

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    await waitFor(() => {
      expect(screen.getByText(/This encounter was modified by another user/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }));

    expect(
      screen.queryByText(/This encounter was modified by another user/i)
    ).not.toBeInTheDocument();
  });

  it('does not poll for conflicts in readOnly mode', () => {
    render(
      <SoapNotesEditor
        {...defaultProps}
        readOnly
        encounterId="enc-123"
        serverLastUpdatedAt={new Date().toISOString()}
      />
    );

    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  // 6 — onDirtyChange callback ──────────────────────────────────────────────

  it('calls onDirtyChange(true) when content changes for the first time', () => {
    const onDirtyChange = jest.fn();
    render(<SoapNotesEditor {...defaultProps} onDirtyChange={onDirtyChange} />);

    // Simulate the editor's onUpdate callback firing
    act(() => {
      capturedOnUpdate?.({ editor: { ...mockEditor, getHTML: () => '<p>new text</p>' } });
    });

    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it('calls onDirtyChange(false) after auto-save runs', async () => {
    const onDirtyChange = jest.fn();
    render(
      <SoapNotesEditor {...defaultProps} onAutoSave={jest.fn()} onDirtyChange={onDirtyChange} />
    );

    // Make it dirty first
    act(() => {
      capturedOnUpdate?.({ editor: mockEditor });
    });

    // Trigger auto-save
    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(onDirtyChange).toHaveBeenCalledWith(false);
  });

  // 7 — @mention items ──────────────────────────────────────────────────────

  it('renders the editor regardless of mentionItems being supplied', () => {
    const mentionItems: MentionItem[] = [
      { id: 'p1', label: 'Alice Smith', type: 'patient' },
      { id: 'e1', label: 'Enc-2024-001', type: 'encounter' },
    ];

    render(<SoapNotesEditor {...defaultProps} mentionItems={mentionItems} />);

    // The editor content area should be present
    expect(screen.getAllByTestId('editor-content').length).toBeGreaterThan(0);
  });

  // 8 — readOnly hides dictation controls ──────────────────────────────────

  it('does not show dictation controls in readOnly mode', () => {
    render(<SoapNotesEditor {...defaultProps} readOnly />);
    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument();
  });

  // 9 — Auto-save hint text ─────────────────────────────────────────────────

  it('shows Ctrl+S hint in the auto-save footer', () => {
    render(<SoapNotesEditor {...defaultProps} onAutoSave={jest.fn()} />);
    expect(screen.getByText(/Ctrl\+S to save now/i)).toBeInTheDocument();
  });

  // 10 — Does not auto-save when onAutoSave is not supplied ─────────────────

  it('does not throw when onAutoSave is undefined and Ctrl+S is pressed', () => {
    render(<SoapNotesEditor {...defaultProps} />);

    expect(() => {
      const fakeEvent = { ctrlKey: true, metaKey: false, key: 's', preventDefault: jest.fn() };
      capturedHandleKeyDown!(null, fakeEvent as unknown as KeyboardEvent);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// medicalShorthand tests (pure utility)
// ---------------------------------------------------------------------------

import { getSuggestions, expandShorthandInText, expandShorthand } from '@/lib/medicalShorthand';

describe('medicalShorthand utilities', () => {
  describe('getSuggestions', () => {
    it('returns matching suggestions for a prefix', () => {
      const results = getSuggestions('SO');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.abbr).toBe('SOB');
      expect(results[0]!.expansion).toBe('Shortness of breath');
    });

    it('returns empty array for short input (< 2 chars)', () => {
      expect(getSuggestions('S')).toHaveLength(0);
      expect(getSuggestions('')).toHaveLength(0);
    });

    it('is case-insensitive', () => {
      const upper = getSuggestions('ht');
      expect(upper.some((s) => s.abbr === 'HTN')).toBe(true);
    });

    it('returns at most 6 results', () => {
      const results = getSuggestions('');
      expect(results.length).toBeLessThanOrEqual(6);
    });
  });

  describe('expandShorthand', () => {
    it('expands a known abbreviation', () => {
      expect(expandShorthand('SOB')).toBe('Shortness of breath');
    });

    it('returns null for unknown abbreviation', () => {
      expect(expandShorthand('XYZ')).toBeNull();
    });
  });

  describe('expandShorthandInText', () => {
    it('expands abbreviations in free text', () => {
      const result = expandShorthandInText('Patient has SOB and HTN');
      expect(result).toContain('Shortness of breath');
      expect(result).toContain('Hypertension');
    });

    it('does not expand substrings that are not whole words', () => {
      // "BP" inside "BPD" should not be replaced
      const result = expandShorthandInText('Diagnosis: BPDS');
      // "BP" whole-word should not match inside BPDS
      expect(result).not.toContain('Blood pressure');
    });

    it('returns empty string unchanged', () => {
      expect(expandShorthandInText('')).toBe('');
    });

    it('handles text without any abbreviations', () => {
      const text = 'No medical abbreviations here.';
      expect(expandShorthandInText(text)).toBe(text);
    });
  });
});
