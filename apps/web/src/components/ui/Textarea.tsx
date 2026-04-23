import { forwardRef, type TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helperText, error, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const hasError = Boolean(error);

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-neutral-700">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
          }
          className={[
            'bg-neutral-0 w-full rounded-md border px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400',
            'focus:ring-primary-500 focus:border-primary-500 transition-colors focus:ring-2 focus:outline-none',
            'min-h-[80px] resize-y disabled:cursor-not-allowed disabled:opacity-50',
            hasError ? 'border-danger-500' : 'border-neutral-200',
            className ?? '',
          ].join(' ')}
          {...props}
        />
        {hasError && (
          <p id={`${inputId}-error`} className="text-danger-500 text-xs">
            {error}
          </p>
        )}
        {!hasError && helperText && (
          <p id={`${inputId}-helper`} className="text-xs text-neutral-500">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
