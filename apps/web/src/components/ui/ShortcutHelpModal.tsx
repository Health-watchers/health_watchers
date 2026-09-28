'use client';

import { Modal } from '@/components/ui/Modal';

export interface ShortcutGroup {
  label: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Navigation',
    shortcuts: [
      { keys: ['⌘K', 'Ctrl+K'], description: 'Open command palette' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['Alt+1'], description: 'Go to Dashboard' },
      { keys: ['Alt+2'], description: 'Go to Patients' },
      { keys: ['Alt+3'], description: 'Go to Encounters' },
      { keys: ['Alt+4'], description: 'Go to Appointments' },
    ],
  },
  {
    label: 'Encounters / SOAP',
    shortcuts: [
      { keys: ['Ctrl+S'], description: 'Save draft' },
      { keys: ['Alt+S'], description: 'Jump to Subjective section' },
      { keys: ['Alt+O'], description: 'Jump to Objective section' },
      { keys: ['Alt+A'], description: 'Jump to Assessment section' },
      { keys: ['Alt+P'], description: 'Jump to Plan section' },
    ],
  },
  {
    label: 'Help',
    shortcuts: [
      { keys: ['?'], description: 'Open this help dialog' },
      { keys: ['Escape'], description: 'Close dialogs / cancel' },
    ],
  },
];

function KbdKey({ label }: { label: string }) {
  return (
    <kbd className="inline-flex items-center rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-xs font-medium text-neutral-700 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-200">
      {label}
    </kbd>
  );
}

interface ShortcutHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutHelpModal({ open, onClose }: ShortcutHelpModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      description="Speed up your workflow with these keyboard shortcuts."
      size="lg"
    >
      <div className="mt-4 space-y-6" role="list" aria-label="Keyboard shortcuts">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.label} role="listitem">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              {group.label}
            </h3>
            <dl className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {group.shortcuts.map(({ keys, description }) => (
                <div key={description} className="flex items-center justify-between py-2 text-sm">
                  <dt className="text-neutral-700 dark:text-neutral-200">{description}</dt>
                  <dd className="flex items-center gap-1" aria-label={keys.join(' or ')}>
                    {keys.map((k, i) => (
                      <span key={k} className="flex items-center gap-1">
                        {i > 0 && <span className="text-neutral-400 dark:text-neutral-500">/</span>}
                        <KbdKey label={k} />
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <p className="mt-6 text-xs text-neutral-400 dark:text-neutral-500">
        Shortcuts are disabled while typing in text fields, unless noted otherwise.
      </p>
    </Modal>
  );
}
