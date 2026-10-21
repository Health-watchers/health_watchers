# Modal and Dialog Components

This document covers the reusable modal and dialog component system.

## Overview

The modal system provides:
- Accessible dialog components with ARIA support
- Modal stacking for multiple concurrent modals
- Keyboard navigation and shortcuts
- Animation system
- Focus management
- Event handling
- Responsive behavior
- Testing utilities

## Components

### Dialog

The main dialog/modal component with built-in accessibility support.

```tsx
import { Dialog } from '@/components/ui/Dialog';

function MyComponent() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Dialog</button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Dialog Title"
        description="Optional description"
        size="md"
        animated
      >
        <p>Your content here</p>
      </Dialog>
    </>
  );
}
```

#### Props

- `open: boolean` - Controls visibility
- `onClose: () => void` - Called when dialog should close
- `title?: string` - Dialog title
- `description?: string` - Dialog description
- `children: ReactNode` - Dialog content
- `className?: string` - Additional CSS classes
- `size?: 'sm' | 'md' | 'lg' | 'xl'` - Size preset (default: 'md')
- `id?: string` - Unique identifier for stacking
- `onEscape?: () => void` - Custom escape handler
- `closeOnBackdropClick?: boolean` - Close on backdrop click (default: true)
- `animated?: boolean` - Enable animations (default: true)

### Modal Composition Components

For more granular control, use composition components:

```tsx
import { Dialog } from '@/components/ui/Dialog';
import {
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
  ModalContent,
} from '@/components/ui/ModalComposition';

function MyModal() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onClose={() => setOpen(false)}>
      <ModalHeader>
        <ModalTitle>Title</ModalTitle>
        <ModalDescription>Description</ModalDescription>
      </ModalHeader>
      <ModalBody>
        <p>Content</p>
      </ModalBody>
      <ModalFooter>
        <button onClick={() => setOpen(false)}>Cancel</button>
        <button>Submit</button>
      </ModalFooter>
    </Dialog>
  );
}
```

## Hooks

### useModal

Manage modal open/close state:

```tsx
import { useModal } from '@/hooks/useModal';

function MyComponent() {
  const modal = useModal({
    onOpen: () => console.log('opened'),
    onClose: () => console.log('closed'),
  });

  return (
    <>
      <button onClick={modal.open}>Open</button>
      <Dialog open={modal.isOpen} onClose={modal.close}>
        Content
      </Dialog>
    </>
  );
}
```

### useModalStack

Manage multiple modals:

```tsx
import { useModalStack } from '@/hooks/useModal';

function MyComponent() {
  const { stack, push, pop, close, getTopmost } = useModalStack();

  return (
    <div>
      <p>Open modals: {stack.length}</p>
    </div>
  );
}
```

## Features

### Focus Management

- Automatic focus to first focusable element on open
- Tab/Shift+Tab cycling within modal
- Focus return on close

### Keyboard Shortcuts

- `Escape` - Close top modal
- `Tab` - Navigate forward through focusable elements
- `Shift+Tab` - Navigate backward

### Modal Stacking

Multiple modals automatically stack with proper z-index management:

```tsx
const [modal1Open, setModal1Open] = useState(false);
const [modal2Open, setModal2Open] = useState(false);

return (
  <>
    <Dialog open={modal1Open} onClose={() => setModal1Open(false)}>
      <button onClick={() => setModal2Open(true)}>Open Modal 2</button>
    </Dialog>
    <Dialog open={modal2Open} onClose={() => setModal2Open(false)}>
      Modal 2 content
    </Dialog>
  </>
);
```

### Animation

Enable/disable animations:

```tsx
<Dialog
  open={open}
  onClose={onClose}
  animated={true} // or false
>
  Content
</Dialog>
```

Animations include:
- Fade-in backdrop (0.2s)
- Slide-in content (0.3s)

### Event Handling

Custom handlers for specific events:

```tsx
<Dialog
  open={open}
  onClose={() => setOpen(false)}
  onEscape={() => console.log('Escape pressed')}
  closeOnBackdropClick={true}
>
  Content
</Dialog>
```

### Responsive Behavior

Size presets adjust automatically for different screen sizes:

- `sm`: 24rem (mobile-optimized)
- `md`: 32rem (tablet)
- `lg`: 42rem (desktop)
- `xl`: 56rem (wide screens)

## Testing

Use `ModalTestingUtils` for testing:

```tsx
import { ModalTestingUtils } from '@/components/ui/__tests__/modal-testing-utils';

describe('MyModal', () => {
  it('opens and closes', async () => {
    render(<MyModal />);

    // Check if modal is open
    expect(ModalTestingUtils.isModalOpen()).toBe(true);

    // Click close button
    await ModalTestingUtils.clickClose();

    // Wait for close
    await ModalTestingUtils.waitForClose();
  });

  it('closes on escape', () => {
    render(<MyModal />);

    ModalTestingUtils.pressEscape();

    expect(ModalTestingUtils.isModalOpen()).toBe(false);
  });

  it('closes on backdrop click', async () => {
    render(<MyModal />);

    await ModalTestingUtils.clickBackdrop();

    expect(ModalTestingUtils.isModalOpen()).toBe(false);
  });
});
```

## Accessibility

All components follow WCAG 2.1 guidelines:

- Proper ARIA roles and labels
- Keyboard navigation support
- Focus management
- Semantic HTML structure
- Color contrast compliance

## Migration from Old Modal

Replace old Modal usage:

```tsx
// Old
import { Modal } from '@/components/ui/Modal';
<Modal open={open} onClose={onClose}>Content</Modal>

// New
import { Dialog } from '@/components/ui/Dialog';
<Dialog open={open} onClose={onClose}>Content</Dialog>
```

The old `Modal` component is still available for backward compatibility but should use `Dialog` for new components.

## Best Practices

1. Always provide `title` or `description` for accessibility
2. Set `id` if stacking multiple modals
3. Use composition components for complex layouts
4. Handle escape key properly
5. Return focus after modal closes
6. Test keyboard navigation
7. Ensure content is readable at all sizes
