'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHotkeys } from '@/hooks/useHotkeys';
import { ShortcutHelpModal } from '@/components/ui/ShortcutHelpModal';
import { useCommandPalette } from '@/components/CommandPalette/CommandPaletteContext';

/**
 * GlobalHotkeys — mounts once in the app layout (inside auth-aware routes).
 * Registers application-wide keyboard shortcuts.
 *
 * Shortcuts:
 *  - ⌘K / Ctrl+K  → open command palette
 *  - /             → focus first search input on page
 *  - ?             → open shortcut help modal
 *  - Alt+1..4      → navigate to Dashboard / Patients / Encounters / Appointments
 *  - Ctrl+S        → trigger save draft (dispatches custom event; handled by forms)
 */
export function GlobalHotkeys() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const { open: openPalette } = useCommandPalette();

  // ⌘K / Ctrl+K → open command palette
  useHotkeys(['ctrl+k', 'meta+k'], (e) => {
    e.preventDefault();
    openPalette();
  });

  // / → focus first search input on page (skip if already in a form element)
  useHotkeys('/', (e) => {
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[type="search"], input[placeholder*="earch"], input[aria-label*="earch"]'
    );
    if (searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // ? → shortcut help
  useHotkeys('?', (e) => {
    e.preventDefault();
    setHelpOpen(true);
  });

  // Alt+1 → Dashboard
  useHotkeys('alt+1', (e) => {
    e.preventDefault();
    router.push('/');
  });

  // Alt+2 → Patients
  useHotkeys('alt+2', (e) => {
    e.preventDefault();
    router.push('/patients');
  });

  // Alt+3 → Encounters
  useHotkeys('alt+3', (e) => {
    e.preventDefault();
    router.push('/encounters');
  });

  // Alt+4 → Appointments
  useHotkeys('alt+4', (e) => {
    e.preventDefault();
    router.push('/appointments');
  });

  // Ctrl+S → dispatch "save-draft" custom event (SOAP editors listen for this)
  useHotkeys(
    'ctrl+s',
    (e) => {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('hw:save-draft'));
    },
    { enableOnFormTags: true }
  );

  return <ShortcutHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />;
}
