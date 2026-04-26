# Mobile Responsive Design Guide

## Responsive Breakpoints

Health Watchers uses Tailwind CSS with the following breakpoints:

- **Mobile**: < 640px (single column, bottom navigation)
- **Tablet**: 640px - 1024px (two column, collapsible sidebar)
- **Desktop**: > 1024px (full layout with sidebar)

## Touch-Friendly UI Guidelines

### Minimum Touch Target Size

All interactive elements must have a minimum size of 44x44px:

```tsx
// Use the touch-target utility class
<button className="touch-target px-4 py-2">
  Click me
</button>

// Or use min-w-touch and min-h-touch
<button className="min-w-touch min-h-touch">
  <Icon />
</button>
```

### Mobile Navigation

On mobile devices (< 768px), the sidebar is replaced with a bottom navigation bar:

```tsx
import { MobileNavigation } from '@/components/MobileNavigation';

// In your layout
<MobileNavigation />
```

The bottom navigation includes:
- Dashboard
- Patients
- Encounters
- Payments
- More (for additional menu items)

### Responsive Layout Example

```tsx
<div className="container mx-auto px-4">
  {/* Mobile: single column, Tablet: 2 columns, Desktop: 3 columns */}
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <Card />
    <Card />
    <Card />
  </div>
</div>
```

### Responsive Typography

```tsx
<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold">
  Responsive Heading
</h1>

<p className="text-sm md:text-base">
  Responsive paragraph text
</p>
```

### Responsive Spacing

```tsx
<div className="p-4 md:p-6 lg:p-8">
  Content with responsive padding
</div>

<div className="space-y-4 md:space-y-6">
  Responsive vertical spacing
</div>
```

## PWA Features

### Service Worker

The service worker is automatically registered and provides:

- **Offline caching** for static assets
- **Network-first strategy** for API requests
- **Cache-first strategy** for static resources
- **Offline fallback page**

### Installation

Users can install the app on their devices:

```tsx
import { usePWA } from '@/hooks/usePWA';

function InstallButton() {
  const { canInstall, installApp } = usePWA();

  if (!canInstall) return null;

  return (
    <button onClick={installApp} className="touch-target">
      Install App
    </button>
  );
}
```

### Offline Indicator

Show users when they're offline:

```tsx
import { OfflineIndicator } from '@/components/OfflineIndicator';

// In your layout
<OfflineIndicator />
```

## Mobile-Specific Features

### Pull-to-Refresh

Implement pull-to-refresh on list pages:

```tsx
const [refreshing, setRefreshing] = useState(false);

const handleRefresh = async () => {
  setRefreshing(true);
  await fetchData();
  setRefreshing(false);
};

// Use a library like react-pull-to-refresh
<PullToRefresh onRefresh={handleRefresh}>
  <PatientList />
</PullToRefresh>
```

### Swipe Gestures

Use swipe gestures for navigation:

```tsx
import { useSwipeable } from 'react-swipeable';

const handlers = useSwipeable({
  onSwipedLeft: () => goToNextPage(),
  onSwipedRight: () => goToPreviousPage(),
});

<div {...handlers}>
  Swipeable content
</div>
```

### Safe Area Insets

Handle notches and safe areas on iOS:

```tsx
<div className="safe-area-top safe-area-bottom">
  Content that respects safe areas
</div>
```

## Testing Responsive Design

### Browser DevTools

1. Open Chrome DevTools (F12)
2. Click the device toolbar icon (Ctrl+Shift+M)
3. Test different device sizes:
   - iPhone SE (375px)
   - iPhone 12 Pro (390px)
   - iPad (768px)
   - Desktop (1280px+)

### Lighthouse PWA Audit

Run Lighthouse audit to check PWA score:

```bash
npm run lighthouse
```

Target scores:
- PWA: > 90
- Performance: > 90
- Accessibility: > 90

## Common Patterns

### Responsive Table

```tsx
{/* Desktop: table, Mobile: cards */}
<div className="hidden md:block">
  <table>...</table>
</div>

<div className="md:hidden space-y-4">
  {items.map(item => (
    <Card key={item.id}>
      <CardContent>{item.name}</CardContent>
    </Card>
  ))}
</div>
```

### Responsive Modal

```tsx
<Dialog>
  <DialogContent className="w-full max-w-lg mx-4 md:mx-auto">
    Modal content
  </DialogContent>
</Dialog>
```

### Responsive Form

```tsx
<form className="space-y-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <Input label="First Name" />
    <Input label="Last Name" />
  </div>
  
  <Input label="Email" className="w-full" />
  
  <Button className="w-full md:w-auto touch-target">
    Submit
  </Button>
</form>
```

## Accessibility

- All touch targets minimum 44x44px
- Sufficient color contrast (WCAG AA)
- Keyboard navigation support
- Screen reader friendly
- Focus indicators visible

## Performance

- Lazy load images
- Code splitting for routes
- Minimize bundle size
- Use next/image for optimized images
- Implement virtual scrolling for long lists
