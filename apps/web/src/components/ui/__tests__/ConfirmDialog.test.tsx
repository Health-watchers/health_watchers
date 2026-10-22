import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: 'Delete item',
    message: 'Are you sure?',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title and message when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Delete item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('renders custom confirm and cancel labels', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Yes, delete" cancelLabel="No, keep" />);
    expect(screen.getByRole('button', { name: /yes, delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no, keep/i })).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = jest.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the cancel button is clicked', async () => {
    const onClose = jest.fn();
    render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = jest.fn();
    render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
    const backdrop = screen.getByRole('dialog').querySelector('.confirm-dialog-backdrop');
    if (backdrop) {
      await userEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = jest.fn();
    render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when Escape is pressed while loading', () => {
    const onClose = jest.fn();
    render(<ConfirmDialog {...defaultProps} onClose={onClose} loading={true} />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables confirm button while loading', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });

  // ── Typed-name confirmation ──────────────────────────────────────────────
  describe('with requireTextMatch', () => {
    it('renders a text input and disables confirm until the text matches', () => {
      render(<ConfirmDialog {...defaultProps} requireTextMatch="John Doe" />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
    });

    it('enables confirm when the typed text matches exactly', async () => {
      render(<ConfirmDialog {...defaultProps} requireTextMatch="John Doe" />);
      const input = screen.getByRole('textbox');
      const confirmBtn = screen.getByRole('button', { name: /delete/i });

      await userEvent.type(input, 'John Doe');
      expect(confirmBtn).not.toBeDisabled();
    });

    it('keeps confirm disabled when the typed text does not match', async () => {
      render(<ConfirmDialog {...defaultProps} requireTextMatch="John Doe" />);
      const input = screen.getByRole('textbox');
      const confirmBtn = screen.getByRole('button', { name: /delete/i });

      await userEvent.type(input, 'John');
      expect(confirmBtn).toBeDisabled();
    });

    it('trims whitespace before comparing', async () => {
      render(<ConfirmDialog {...defaultProps} requireTextMatch="John Doe" />);
      const input = screen.getByRole('textbox');
      const confirmBtn = screen.getByRole('button', { name: /delete/i });

      await userEvent.type(input, '  John Doe  ');
      expect(confirmBtn).not.toBeDisabled();
    });

    it('calls onConfirm when text matches and Enter is pressed', async () => {
      const onConfirm = jest.fn();
      render(<ConfirmDialog {...defaultProps} requireTextMatch="John Doe" onConfirm={onConfirm} />);
      const input = screen.getByRole('textbox');

      await userEvent.type(input, 'John Doe');
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledTimes(1);
      });
    });

    it('resets the typed text when reopened', async () => {
      const { rerender } = render(
        <ConfirmDialog {...defaultProps} requireTextMatch="John Doe" open={false} />
      );
      // Open the dialog
      rerender(<ConfirmDialog {...defaultProps} requireTextMatch="John Doe" open={true} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      await userEvent.type(input, 'John Doe');
      expect(input.value).toBe('John Doe');

      // Close and reopen — input should be reset
      rerender(<ConfirmDialog {...defaultProps} requireTextMatch="John Doe" open={false} />);
      rerender(<ConfirmDialog {...defaultProps} requireTextMatch="John Doe" open={true} />);
      const newInput = screen.getByRole('textbox') as HTMLInputElement;
      expect(newInput.value).toBe('');
    });

    it('shows the match prompt with the required text', () => {
      render(<ConfirmDialog {...defaultProps} requireTextMatch="John Doe" />);
      expect(screen.getByText(/type "John Doe" to confirm/i)).toBeInTheDocument();
    });

    it('shows a custom match prompt when provided', () => {
      render(
        <ConfirmDialog
          {...defaultProps}
          requireTextMatch="John Doe"
          matchPrompt="Enter the patient name"
        />
      );
      expect(screen.getByText('Enter the patient name')).toBeInTheDocument();
    });
  });

  // ── Async onConfirm ──────────────────────────────────────────────────────
  it('disables confirm and shows spinner while loading is true', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);
    const confirmBtn = screen.getByRole('button', { name: /delete/i });
    expect(confirmBtn).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /delete/i }).querySelector('svg.animate-spin')
    ).toBeTruthy();
  });

  it('calls onConfirm when confirm is clicked and not loading', async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    const confirmBtn = screen.getByRole('button', { name: /delete/i });
    await userEvent.click(confirmBtn);
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });
});
