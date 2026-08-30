# Bundle Size Optimization Guide

## Overview

This guide documents strategies and tools for optimizing bundle size in the Health Watchers web application.

## Current Metrics

- **Target Bundle Size**: <100KB (gzipped)
- **Target Initial Load**: <2 seconds
- **Reduction Goal**: 30% from baseline

## Optimization Strategies

### 1. Code Splitting by Route

Next.js automatically code splits at the route level. Each page is its own chunk:

```
# Automatic splitting:
pages/dashboard.tsx → /dashboard-xyz.js
pages/patients.tsx → /patients-xyz.js
pages/settings.tsx → /settings-xyz.js
```

### 2. Dynamic Imports for Heavy Components

Use dynamic imports for components that are only needed on specific routes:

```tsx
// ❌ Bad - loads on initial page load
import DosageCalculator from '@/components/encounters/DosageCalculatorModal';

// ✅ Good - only loads when needed
import dynamic from 'next/dynamic';

const DosageCalculator = dynamic(
  () => import('@/components/encounters/DosageCalculatorModal'),
  { loading: () => <Spinner />, ssr: false }
);
```

### 3. Lazy Loading for Feature Components

Use the lazy-loading utilities for better control:

```tsx
import { lazyComponent } from '@/lib/lazy-loading';

const { Suspense: LazySuspense } = lazyComponent(
  () => import('./HeavyComponent'),
  'HeavyComponent',
  { fallback: <LoadingSpinner /> }
);

export function Page() {
  return <LazySuspense />;
}
```

### 4. Tree Shaking

Ensure proper tree-shaking by:

1. **Using named exports** (not default exports) in utility modules
2. **Avoiding side effects** in imported modules
3. **Importing only what you need**:

```tsx
// ❌ Bad - imports entire library
import * as Utils from '@/lib/utils';
Utils.truncateId(...);

// ✅ Good - only imports specific function
import { truncateId } from '@/lib/utils';
truncateId(...);
```

### 5. Optimize Dependencies

#### Recharts Optimization

Recharts is one of the largest dependencies. Optimize its usage:

```tsx
// ❌ Bad - imports everything
import * as Recharts from 'recharts';

// ✅ Good - only import needed components
import { LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Line } from 'recharts';
```

#### Remove Unused Dependencies

Periodically audit for unused packages:

```bash
npm ls --depth=0  # List all dependencies
npx depcheck       # Find unused packages
```

### 6. Conditional Loading

Load heavy libraries only when needed:

```tsx
export function LoadableFeature() {
  const [show, setShow] = useState(false);

  return (
    <>
      <button onClick={() => setShow(true)}>Load Feature</button>
      {show && <HeavyComponent />}
    </>
  );
}
```

### 7. Component Composition

Split large components into smaller, independently loaded pieces:

```tsx
// Before: one 50KB component
import HugeForm from './HugeForm';

// After: split into smaller pieces
const BasicForm = dynamic(() => import('./BasicForm'));
const AdvancedOptions = dynamic(() => import('./AdvancedOptions'));
const Preview = dynamic(() => import('./Preview'));
```

## Monitoring Tools

### Bundle Analysis

Analyze your bundle after building:

```bash
npm run analyze:bundle
```

This generates a detailed report showing:
- Total bundle size
- Individual chunk sizes
- Budget violations
- Recommendations

### Bundle Budget

The project maintains a bundle budget in `.bundlebudgetrc.json`:

```json
{
  "bundles": [
    {
      "name": "main",
      "maxSize": "100kb",
      "description": "Main application bundle"
    }
  ]
}
```

Exceeding the budget will cause the build to fail.

## Next.js Config Optimizations

Current settings in `next.config.js`:

```javascript
// Optimize package imports
experimental: {
  optimizePackageImports: [
    'recharts',
    '@tanstack/react-query',
    'lucide-react',
    'clsx',
    'tailwind-merge',
  ],
}

// Advanced webpack splitting
webpack: {
  splitChunks: {
    chunks: 'all',
    maxInitialRequests: 30,
    maxAsyncRequests: 30,
    minSize: 15000,
    maxSize: 200000,
  }
}
```

## Performance Metrics

Track bundle performance over time:

```bash
# Get baseline metrics
npm run build

# Compare with previous builds
npm run analyze:bundle
```

## Checklist for PRs

Before merging bundle-affecting changes:

- [ ] Run `npm run build`
- [ ] Check bundle analysis output
- [ ] Verify no budget violations
- [ ] Test on slow network (DevTools throttling)
- [ ] Measure performance improvement/regression
- [ ] Document any new large dependencies

## Common Mistakes

1. **Importing entire libraries** - Use named imports
2. **No code splitting** - Lazy load heavy features
3. **Unused dependencies** - Regularly audit dependencies
4. **Large images** - Optimize and use Next.js Image component
5. **Duplicate libraries** - Check node_modules for duplicates

## Recommended Reading

- [Next.js Performance Optimization](https://nextjs.org/learn/seo/performance-web-vitals)
- [Webpack Code Splitting](https://webpack.js.org/guides/code-splitting/)
- [Web Performance Working Group](https://www.w3.org/webperf/)

## Resources

- Bundle analysis tool: `.next/analyze/`
- Performance audit: Chrome DevTools > Lighthouse
- Network analysis: Chrome DevTools > Network tab
