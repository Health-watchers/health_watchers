'use client';

type Section =
  | 'profile'
  | 'security'
  | 'preferences'
  | 'subscription'
  | 'sessions'
  | 'api-keys'
  | 'webhooks';

interface SubNavigationProps {
  active: Section;
  onChange: (section: Section) => void;
}

const items: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'subscription', label: 'Subscription' },
  { id: 'api-keys', label: 'API Keys' },
  { id: 'webhooks', label: 'Webhooks' },
];

export function SubNavigation({ active, onChange }: SubNavigationProps) {
  return (
    <nav aria-label="Settings sections">
      <ul className="flex flex-col gap-1">
        {items.map(({ id, label }) => {
          const isActive = active === id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onChange(id)}
                className={[
                  'w-full rounded-r-md px-4 py-2 text-left text-sm transition-colors',
                  isActive
                    ? 'border-l-2 border-primary-600 bg-primary-50 font-semibold text-primary-700'
                    : 'text-secondary-700 border-l-2 border-transparent hover:bg-neutral-100',
                ].join(' ')}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
