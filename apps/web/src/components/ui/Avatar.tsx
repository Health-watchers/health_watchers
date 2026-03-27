import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

const avatar = cva(
  'inline-flex items-center justify-center rounded-full bg-primary-500 text-white font-semibold select-none shrink-0 overflow-hidden',
  {
    variants: {
      size: {
        sm: 'w-7 h-7 text-xs',
        md: 'w-9 h-9 text-sm',
        lg: 'w-12 h-12 text-base',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

export interface AvatarProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof avatar> {
  src?: string;
  alt?: string;
  initials?: string;
}

export function Avatar({ src, alt, initials, size, className, ...props }: AvatarProps) {
  return (
    <span className={avatar({ size, className })} {...props}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? ''} className="w-full h-full object-cover" />
      ) : (
        <span aria-label={alt}>{initials ?? '?'}</span>
      )}
    </span>
  );
}
