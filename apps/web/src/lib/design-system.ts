/**
 * Design System Constants
 * Issue #1221 - Responsive Design System Refactor
 *
 * Centralized design tokens for consistent UI across all breakpoints.
 * Use these constants instead of hardcoded values in components.
 *
 * All classes are mobile-first: base = xs/mobile, then sm/md/lg/xl override.
 */

export const breakpoints = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/** Responsive typography scale — mobile first */
export const typography = {
  display: {
    base: 'text-2xl font-bold leading-tight tracking-tight',
    sm: 'sm:text-3xl',
    lg: 'lg:text-4xl',
    xl: 'xl:text-5xl',
  },
  h1: {
    base: 'text-xl font-bold leading-tight',
    sm: 'sm:text-2xl',
    lg: 'lg:text-3xl',
  },
  h2: {
    base: 'text-lg font-semibold leading-snug',
    sm: 'sm:text-xl',
    lg: 'lg:text-2xl',
  },
  h3: {
    base: 'text-base font-semibold leading-snug',
    sm: 'sm:text-lg',
  },
  h4: {
    base: 'text-sm font-semibold',
    sm: 'sm:text-base',
  },
  body: {
    base: 'text-sm leading-relaxed',
    sm: 'sm:text-base',
  },
  bodyLg: 'text-base leading-relaxed sm:text-lg',
  small: 'text-xs leading-relaxed',
  label: 'text-xs font-medium uppercase tracking-wide',
  caption: 'text-xs text-muted-foreground',
  code: 'font-mono text-sm',
} as const;

/** Compose all responsive classes for a typography level */
export function textScale(level: keyof typeof typography): string {
  const scale = typography[level];
  if (typeof scale === 'string') return scale;
  return Object.values(scale).join(' ');
}

/** Responsive spacing scale */
export const spacing = {
  /** Horizontal page padding: 16px → 24px → 32px */
  page: 'px-4 sm:px-6 lg:px-8',
  /** Vertical section spacing */
  section: 'py-8 sm:py-12 lg:py-16',
  /** Card internal padding */
  card: 'p-4 sm:p-6',
  /** Vertical stack gap */
  stack: 'space-y-4 sm:space-y-6',
  /** Inline gap */
  inline: 'gap-2 sm:gap-4',
  /** Form field gap */
  form: 'space-y-4',
} as const;

/** Responsive container layouts */
export const containers = {
  /** Standard page container — max 7xl */
  page: 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  /** Narrow content container — max 3xl */
  narrow: 'w-full max-w-3xl mx-auto px-4 sm:px-6',
  /** Wide container — max screen-2xl */
  wide: 'w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8',
  /** Card shell */
  card: 'rounded-lg border bg-card shadow-sm overflow-hidden',
  /** Full-bleed section */
  full: 'w-full px-4 sm:px-6 lg:px-8',
} as const;

/** Responsive grid layouts */
export const grids = {
  cols2: 'grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6',
  cols3: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6',
  cols4: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4',
  dashboard: 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6',
  sidebar: 'grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6',
  sidebar2: 'grid grid-cols-1 lg:grid-cols-[240px_1fr] xl:grid-cols-[280px_1fr] gap-6',
  autoFit: 'grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 sm:gap-6',
} as const;

/** Responsive flex layout helpers */
export const flex = {
  row: 'flex flex-col sm:flex-row',
  rowReverse: 'flex flex-col-reverse sm:flex-row',
  between: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4',
  center: 'flex items-center justify-center',
  stack: 'flex flex-col',
  wrap: 'flex flex-wrap gap-2 sm:gap-4',
} as const;

/** Touch-friendly interactive element sizes (WCAG 2.5.5: min 44×44px) */
export const interactive = {
  minTouchTarget: 'min-h-[44px] min-w-[44px]',
  button: 'inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-md',
  buttonSm: 'inline-flex items-center justify-center min-h-[36px] px-3 py-1.5 text-sm rounded',
  input: 'min-h-[44px] px-3 py-2 w-full rounded-md border',
  iconButton: 'flex items-center justify-center h-11 w-11 rounded-md',
  link: 'underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
} as const;

/** Responsive image dimensions */
export const images = {
  avatar: { width: 40, height: 40 },
  avatarMd: { width: 56, height: 56 },
  avatarLg: { width: 80, height: 80 },
  thumbnail: { width: 150, height: 150 },
  card: { width: 400, height: 250 },
  hero: { width: 1200, height: 600 },
  /** next/image `sizes` attribute values */
  sizes: {
    avatar: '40px',
    avatarLg: '80px',
    thumbnail: '150px',
    card: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px',
    hero: '100vw',
    halfWidth: '(max-width: 640px) 100vw, 50vw',
    thirdWidth: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  },
} as const;

/** Z-index scale */
export const zIndex = {
  base: 'z-0',
  raised: 'z-10',
  dropdown: 'z-20',
  sticky: 'z-30',
  overlay: 'z-40',
  modal: 'z-50',
  popover: 'z-[55]',
  toast: 'z-[60]',
  tooltip: 'z-[70]',
} as const;

/** Transition / animation helpers */
export const animations = {
  fadeIn: 'transition-opacity duration-200 ease-in-out',
  slideUp: 'transition-transform duration-300 ease-out translate-y-0',
  scaleIn: 'transition-transform duration-200 ease-out scale-100',
  bounce: 'animate-bounce',
  pulse: 'animate-pulse',
  spin: 'animate-spin',
} as const;

/** Focus ring — use for custom interactive elements */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Responsive navigation patterns */
export const navigation = {
  /** Sidebar nav — hidden on mobile, visible on lg+ */
  sidebar: 'hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0',
  /** Mobile nav sheet trigger */
  mobileMenuTrigger: 'flex lg:hidden',
  /** Top nav bar */
  topBar: 'sticky top-0 z-30 flex h-16 items-center border-b bg-background px-4 sm:px-6',
} as const;
