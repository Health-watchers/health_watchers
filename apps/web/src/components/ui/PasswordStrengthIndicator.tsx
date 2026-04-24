'use client';

interface Rule {
  label: string;
  test: (p: string) => boolean;
}

const RULES: Rule[] = [
  { label: 'At least 12 characters', test: (p) => p.length >= 12 },
  { label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'One digit (0–9)', test: (p) => /[0-9]/.test(p) },
  { label: 'One special character (!@#…)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordStrengthIndicator({ password }: { password: string }) {
  if (!password) return null;

  const passed = RULES.filter((r) => r.test(password)).length;
  const pct = (passed / RULES.length) * 100;

  const colorClass =
    pct <= 40
      ? 'bg-error-500'
      : pct <= 60
        ? 'bg-warning-500'
        : pct <= 80
          ? 'bg-warning-400'
          : 'bg-success-500';

  return (
    <div className="mt-2 space-y-2" aria-live="polite">
      <div className="h-1.5 w-full rounded-full bg-neutral-200">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${colorClass} ${
            pct <= 20 ? 'w-1/5' : 
            pct <= 40 ? 'w-2/5' : 
            pct <= 60 ? 'w-3/5' : 
            pct <= 80 ? 'w-4/5' : 
            'w-full'
          }`}
          role="progressbar"
          aria-valuenow={passed}
          aria-valuemin={0}
          aria-valuemax={RULES.length}
          aria-label="Password strength"
        />
      </div>
      <ul className="space-y-0.5">
        {RULES.map((r) => {
          const ok = r.test(password);
          return (
            <li
              key={r.label}
              className={`flex items-center gap-1.5 text-xs ${ok ? 'text-success-600' : 'text-neutral-500'}`}
            >
              <span aria-hidden="true">{ok ? '✓' : '○'}</span>
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
