# Theming System Documentation

## Overview

The Health Watchers application uses CSS custom properties (design tokens) to enable flexible theming and white-label branding for different clinics.

## Design Tokens

All design tokens are defined in `apps/web/src/app/globals.css` using the `@theme` directive. These tokens are available throughout the application and can be overridden programmatically for custom clinic branding.

### Color Tokens

#### Primary Colors
Used for primary actions, links, and brand elements:
- `--color-primary-50` through `--color-primary-900` (light to dark)

#### Neutral Colors
Used for text, backgrounds, and borders:
- `--color-neutral-0` (white)
- `--color-neutral-50` through `--color-neutral-900` (light to dark)

#### Success Colors
Used for success states and positive feedback:
- `--color-success-50` through `--color-success-900`

#### Warning Colors
Used for warning states and caution indicators:
- `--color-warning-50` through `--color-warning-900`

#### Danger Colors
Used for error states and destructive actions:
- `--color-danger-50` through `--color-danger-900`

#### Stellar Colors
Used for blockchain-related features:
- `--color-stellar-50` through `--color-stellar-900`

### Spacing Tokens

Consistent spacing scale for margins, padding, and gaps:
- `--spacing-xs`: 0.25rem (4px)
- `--spacing-sm`: 0.5rem (8px)
- `--spacing-md`: 1rem (16px)
- `--spacing-lg`: 1.5rem (24px)
- `--spacing-xl`: 2rem (32px)
- `--spacing-2xl`: 3rem (48px)
- `--spacing-3xl`: 4rem (64px)

### Border Radius Tokens

- `--radius-sm`: 0.125rem (2px)
- `--radius-md`: 0.375rem (6px)
- `--radius-lg`: 0.5rem (8px)
- `--radius-xl`: 0.75rem (12px)
- `--radius-2xl`: 1rem (16px)
- `--radius-full`: 9999px (fully rounded)

### Font Size Tokens

- `--font-size-xs`: 0.75rem (12px)
- `--font-size-sm`: 0.875rem (14px)
- `--font-size-base`: 1rem (16px)
- `--font-size-lg`: 1.125rem (18px)
- `--font-size-xl`: 1.25rem (20px)
- `--font-size-2xl`: 1.5rem (24px)
- `--font-size-3xl`: 1.875rem (30px)
- `--font-size-4xl`: 2.25rem (36px)

### Shadow Tokens

- `--shadow-sm`: Small shadow for subtle elevation
- `--shadow-md`: Medium shadow for cards and modals
- `--shadow-lg`: Large shadow for prominent elements
- `--shadow-xl`: Extra large shadow for floating elements

## Custom Clinic Branding

### Overriding Tokens Programmatically

To implement custom clinic branding, override design tokens at runtime by injecting a style element:

```typescript
// Example: Set custom primary color for a clinic
function applyClinicTheme(primaryColor: string) {
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --color-primary-500: ${primaryColor};
      --color-primary-600: ${adjustBrightness(primaryColor, -10)};
      --color-primary-400: ${adjustBrightness(primaryColor, 10)};
    }
  `;
  document.head.appendChild(style);
}
```

### Settings Integration

The `settings` table in the database can store custom theme values:

```typescript
interface ClinicSettings {
  branding: {
    primaryColor?: string;
    logoUrl?: string;
    clinicName?: string;
  };
}
```

When a clinic's settings are loaded, apply the custom theme:

```typescript
// In a layout or provider component
useEffect(() => {
  if (clinicSettings?.branding?.primaryColor) {
    applyClinicTheme(clinicSettings.branding.primaryColor);
  }
}, [clinicSettings]);
```

## Using Tokens in Components

### Tailwind Classes
Tailwind automatically maps to the design tokens:

```tsx
<button className="bg-primary-500 text-white rounded-lg px-md py-sm shadow-md">
  Click me
</button>
```

### Direct CSS Custom Properties

```tsx
<div style={{ color: 'var(--color-primary-500)' }}>
  Custom colored text
</div>
```

### CSS Files

```css
.custom-component {
  background-color: var(--color-neutral-50);
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
  box-shadow: var(--shadow-md);
}
```

## Best Practices

1. **Always use tokens**: Never hardcode colors, spacing, or other design values
2. **Semantic naming**: Use tokens for their intended purpose (e.g., don't use `--color-danger-500` for success states)
3. **Test overrides**: When implementing custom themes, test that all components update correctly
4. **Maintain contrast**: Ensure custom colors meet WCAG accessibility standards
5. **Document customizations**: Keep track of which clinics have custom themes

## Migration Guide

For existing components using hardcoded values:

**Before:**
```tsx
<div className="bg-blue-500 text-white p-4 rounded-lg">
```

**After:**
```tsx
<div className="bg-primary-500 text-white p-md rounded-lg">
```

## Testing Theme Overrides

To test that theme overrides work correctly:

1. Override a design token in your browser's dev tools:
   ```css
   :root {
     --color-primary-500: #ff0000;
   }
   ```

2. Verify that all components using that token update correctly

3. Test in both light and dark modes

4. Verify accessibility (contrast ratios, focus states, etc.)
