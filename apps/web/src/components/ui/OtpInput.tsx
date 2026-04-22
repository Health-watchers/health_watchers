'use client';

import { useRef, type RefObject, type ClipboardEvent, type KeyboardEvent } from 'react';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

export function OtpInput({ value, onChange, disabled, error }: OtpInputProps) {
  const refs: RefObject<HTMLInputElement>[] = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Pad/trim value to exactly 6 chars
  const cells = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  function focusCell(index: number) {
    if (index >= 0 && index < 6) {
      refs[index].current?.focus();
    }
  }

  function handleChange(i: number, raw: string) {
    // Keep only the last digit entered (handles cases where browser inserts >1 char)
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (raw !== '' && digit === '') return; // non-digit typed — ignore

    const next = cells.slice() as string[];
    next[i] = digit;
    onChange(next.join(''));

    if (digit !== '') {
      focusCell(i + 1);
    }
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && cells[i] === '') {
      e.preventDefault();
      focusCell(i - 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusCell(i - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusCell(i + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;

    const next = cells.slice() as string[];
    for (let i = 0; i < digits.length; i++) {
      next[i] = digits[i];
    }
    onChange(next.join(''));

    // Move focus to the cell after the last pasted digit (or last cell)
    focusCell(Math.min(digits.length, 5));
  }

  return (
    <div>
      <div className="flex gap-2">
        {cells.map((cell, i) => (
          <input
            key={i}
            ref={refs[i]}
            type="text"
            inputMode="numeric"
            maxLength={1}
            pattern="[0-9]"
            value={cell}
            disabled={disabled}
            aria-label={`Digit ${i + 1}`}
            className={[
              'w-10 h-12 text-center rounded-md border text-sm font-medium',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-danger-500' : 'border-neutral-200',
            ].join(' ')}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger-500">
          {error}
        </p>
      )}
    </div>
  );
}
