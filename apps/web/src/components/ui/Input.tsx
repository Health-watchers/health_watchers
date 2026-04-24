import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  errorRole?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { label, helperText, error, errorRole = 'alert', leftIcon, rightIcon, className, id, ...props },
    ref
  ) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const hasError = Boolean(error);

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 text-neutral-500">{leftIcon}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={hasError}
            aria-describedby={
              hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            className={[
              'bg-neutral-0 w-full rounded-md border px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500',
              'focus:ring-primary-500 focus:border-primary-500 transition-colors focus:ring-2 focus:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
              hasError ? 'border-danger-500' : 'border-neutral-200 dark:border-neutral-600',
              leftIcon ? 'pl-9' : '',
              rightIcon ? 'pr-9' : '',
              className ?? '',
            ].join(' ')}
            {...props}
          />
          {rightIcon && <span className="absolute right-3 text-neutral-500">{rightIcon}</span>}
        </div>
        {hasError && (
          <p id={`${inputId}-error`} role={errorRole} className="text-danger-500 text-xs">
            {error}
          </p>
        )}
        {!hasError && helperText && (
          <p id={`${inputId}-helper`} className="text-xs text-neutral-500 dark:text-neutral-400">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
