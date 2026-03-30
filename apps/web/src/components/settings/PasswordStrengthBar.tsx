"use client";

export type StrengthLevel = "weak" | "fair" | "strong" | "very-strong";

export function getStrengthLevel(password: string): StrengthLevel {
  if (password.length < 8) return "weak";

  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ].filter(Boolean).length;

  if (password.length >= 12 && classes === 4) return "very-strong";
  if (classes >= 2) return "strong";
  return "fair";
}

const LEVELS: StrengthLevel[] = ["weak", "fair", "strong", "very-strong"];

const SEGMENT_COLORS: Record<StrengthLevel, string> = {
  weak: "bg-red-500",
  fair: "bg-yellow-400",
  strong: "bg-blue-500",
  "very-strong": "bg-green-500",
};

const ACTIVE_SEGMENTS: Record<StrengthLevel, number> = {
  weak: 1,
  fair: 2,
  strong: 3,
  "very-strong": 4,
};

const LABELS: Record<StrengthLevel, string> = {
  weak: "Weak",
  fair: "Fair",
  strong: "Strong",
  "very-strong": "Very Strong",
};

const LABEL_COLORS: Record<StrengthLevel, string> = {
  weak: "text-red-500",
  fair: "text-yellow-500",
  strong: "text-blue-500",
  "very-strong": "text-green-600",
};

interface PasswordStrengthBarProps {
  password: string;
}

export default function PasswordStrengthBar({
  password,
}: PasswordStrengthBarProps) {
  if (!password) return null;

  const level = getStrengthLevel(password);
  const activeCount = ACTIVE_SEGMENTS[level];
  const activeColor = SEGMENT_COLORS[level];

  return (
    <div className="mt-2 space-y-1">
      <div
        className="flex gap-1"
        role="img"
        aria-label={`Password strength: ${LABELS[level]}`}
      >
        {LEVELS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < activeCount ? activeColor : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${LABEL_COLORS[level]}`}>
        {LABELS[level]}
      </p>
    </div>
  );
}
