'use client';

interface Rule {
  label: string;
  test: (p: string) => boolean;
}

const RULES: Rule[] = [
  { label: 'At least 12 characters',       test: (p) => p.length >= 12 },
  { label: 'One uppercase letter (A–Z)',    test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a–z)',    test: (p) => /[a-z]/.test(p) },
  { label: 'One digit (0–9)',               test: (p) => /[0-9]/.test(p) },
  { label: 'One special character (!@#…)',  test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordStrengthIndicator({ password }: { password: string }) {
  if (!password) return null;

  const passed = RULES.filter((r) => r.test(password)).length;
  const pct = (passed / RULES.length) * 100;

  const color =
    pct <= 40  ? 'bg-red-500'    :
    pct <= 60  ? 'bg-orange-400' :
    pct <= 80  ? 'bg-yellow-400' :
                 'bg-green-500';

  return (
    <div className="mt-2 space-y-2" aria-live="polite">
      <div className="h-1.5 w-full rounded-full bg-gray-200">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
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
            <li key={r.label} className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600' : 'text-gray-400'}`}>
              <span aria-hidden="true">{ok ? '✓' : '○'}</span>
              {r.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
