'use client';

type Section = 'profile' | 'security' | 'preferences';

interface SubNavigationProps {
  active: Section;
  onChange: (section: Section) => void;
}

const items: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'security', label: 'Security' },
  { id: 'preferences', label: 'Preferences' },
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
                    ? 'border-primary-600 text-primary-700 bg-primary-50 border-l-2 font-semibold'
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
