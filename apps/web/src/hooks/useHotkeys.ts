'use client';

import { useEffect, useRef, useCallback } from 'react';

type HotkeyModifiers = {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
};

type HotkeyDescriptor = string; // e.g. "ctrl+s", "alt+1", "/", "?"

interface HotkeyOptions {
  /** When true, the shortcut fires even when focus is inside an input/textarea/select. */
  enableOnFormTags?: boolean;
  /** Only fire when this element (or its subtree) contains focus. */
  scoped?: boolean;
}

function parseDescriptor(descriptor: HotkeyDescriptor): {
  key: string;
  modifiers: HotkeyModifiers;
} {
  const parts = descriptor.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const modifiers: HotkeyModifiers = {
    ctrl: parts.includes('ctrl'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    meta: parts.includes('meta') || parts.includes('cmd'),
  };
  return { key, modifiers };
}

function isFormElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

function matchesEvent(event: KeyboardEvent, key: string, modifiers: HotkeyModifiers): boolean {
  const eventKey = event.key.toLowerCase();

  // Map named keys
  const keyAliases: Record<string, string> = {
    '/': '/',
    '?': '?',
    escape: 'escape',
    enter: 'enter',
    tab: 'tab',
    backspace: 'backspace',
    delete: 'delete',
    arrowup: 'arrowup',
    arrowdown: 'arrowdown',
    arrowleft: 'arrowleft',
    arrowright: 'arrowright',
  };

  const expectedKey = keyAliases[key] ?? key;

  return (
    eventKey === expectedKey &&
    !!event.ctrlKey === !!modifiers.ctrl &&
    !!event.altKey === !!modifiers.alt &&
    !!event.shiftKey === !!modifiers.shift &&
    (!!event.metaKey === !!modifiers.meta || (!modifiers.meta && !modifiers.ctrl))
  );
}

/**
 * useHotkeys — lightweight keyboard shortcut hook.
 *
 * @param descriptor  e.g. "ctrl+s", "alt+1", "/", "?"
 * @param handler     callback invoked when the shortcut fires
 * @param options     optional configuration
 * @param deps        dependency array for the handler (mirrors useCallback)
 *
 * @example
 * useHotkeys('ctrl+s', (e) => { e.preventDefault(); saveDraft(); });
 * useHotkeys('?', () => setHelpOpen(true));
 */
export function useHotkeys(
  descriptor: HotkeyDescriptor | HotkeyDescriptor[],
  handler: (event: KeyboardEvent) => void,
  options: HotkeyOptions = {},
  deps: React.DependencyList = []
): void {
  const { enableOnFormTags = false } = options;

  // Keep handler stable via ref so we don't re-subscribe on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const descriptors = Array.isArray(descriptor) ? descriptor : [descriptor];
  const parsed = descriptors.map(parseDescriptor);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      // Skip when typing in form elements (unless explicitly enabled)
      if (!enableOnFormTags && isFormElement(document.activeElement)) {
        return;
      }

      for (const { key, modifiers } of parsed) {
        if (matchesEvent(event, key, modifiers)) {
          handlerRef.current(event);
          break;
        }
      }
    };

    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptor, enableOnFormTags, ...deps]);
}
