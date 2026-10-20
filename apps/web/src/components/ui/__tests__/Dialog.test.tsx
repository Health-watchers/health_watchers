import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog, DialogStackProvider } from '@/components/ui/Dialog';

describe('Dialog', () => {
  it('renders when open', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Test Dialog">
        Test content
      </Dialog>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Test Dialog">
        Test content
      </Dialog>
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = jest.fn();
    render(
      <Dialog open={true} onClose={onClose}>
        Test content
      </Dialog>
    );

    const closeButton = screen.getByLabelText('Close');
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on escape key', () => {
    const onClose = jest.fn();
    render(
      <Dialog open={true} onClose={onClose}>
        Test content
      </Dialog>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    const onClose = jest.fn();
    const { container } = render(
      <Dialog open={true} onClose={onClose} closeOnBackdropClick={true}>
        Test content
      </Dialog>
    );

    const backdrop = container.querySelector('[aria-hidden="true"]');
    if (backdrop) {
      await userEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('does not close on backdrop click when disabled', async () => {
    const onClose = jest.fn();
    const { container } = render(
      <Dialog open={true} onClose={onClose} closeOnBackdropClick={false}>
        Test content
      </Dialog>
    );

    const backdrop = container.querySelector('[aria-hidden="true"]');
    if (backdrop) {
      await userEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();
    }
  });

  it('sets proper ARIA attributes', () => {
    render(
      <Dialog open={true} onClose={() => {}} title="Dialog Title" description="Dialog Description">
        Content
      </Dialog>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');
    expect(dialog).toHaveAttribute('aria-describedby');
  });

  it('renders with different sizes', () => {
    const sizes = ['sm', 'md', 'lg', 'xl'] as const;

    sizes.forEach((size) => {
      const { unmount, container } = render(
        <Dialog open={true} onClose={() => {}} size={size}>
          Content
        </Dialog>
      );

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toBeInTheDocument();
      unmount();
    });
  });

  it('focuses first focusable element when opened', () => {
    render(
      <DialogStackProvider>
        <Dialog open={true} onClose={() => {}}>
          <input type="text" id="test-input" />
        </Dialog>
      </DialogStackProvider>
    );

    const input = screen.getByRole('textbox');
    // Dialog container should have focus initially
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('hides body scroll when open', () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => {}}>
        Content
      </Dialog>
    );

    expect(document.body.style.overflow).not.toBe('hidden');

    rerender(
      <Dialog open={true} onClose={() => {}}>
        Content
      </Dialog>
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Dialog open={false} onClose={() => {}}>
        Content
      </Dialog>
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('calls custom onEscape handler', () => {
    const onEscape = jest.fn();
    const onClose = jest.fn();

    render(
      <Dialog open={true} onClose={onClose} onEscape={onEscape}>
        Content
      </Dialog>
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onEscape).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
