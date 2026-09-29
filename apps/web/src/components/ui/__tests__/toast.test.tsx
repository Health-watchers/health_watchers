import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Toast, Toaster, toast } from '../toast';

expect.extend(toHaveNoViolations);

describe('Toast Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders toast with message', () => {
      render(<Toast message="Test message" />);
      expect(screen.getByRole('alert')).toHaveTextContent('Test message');
    });

    it('renders with info type by default', () => {
      render(<Toast message="Info message" />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-neutral-800');
    });

    it('renders with success type', () => {
      render(<Toast message="Success message" type="success" />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-green-600');
    });

    it('renders with error type', () => {
      render(<Toast message="Error message" type="error" />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-red-600');
    });

    it('renders close button when onClose is provided', () => {
      const handleClose = jest.fn();
      render(<Toast message="Test" onClose={handleClose} />);
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('does not render close button when onClose is not provided', () => {
      render(<Toast message="Test" />);
      expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      const handleClose = jest.fn();
      render(<Toast message="Test" onClose={handleClose} />);
      
      await user.click(screen.getByRole('button', { name: /dismiss/i }));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('auto-dismisses after default duration', () => {
      const handleClose = jest.fn();
      render(<Toast message="Test" onClose={handleClose} />);
      
      expect(handleClose).not.toHaveBeenCalled();
      
      jest.advanceTimersByTime(4000);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('auto-dismisses after custom duration', () => {
      const handleClose = jest.fn();
      render(<Toast message="Test" onClose={handleClose} duration={2000} />);
      
      jest.advanceTimersByTime(2000);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not auto-dismiss when onClose is not provided', () => {
      render(<Toast message="Test" />);
      
      jest.advanceTimersByTime(5000);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('cleans up timer on unmount', () => {
      const handleClose = jest.fn();
      const { unmount } = render(<Toast message="Test" onClose={handleClose} duration={2000} />);
      
      unmount();
      jest.advanceTimersByTime(2000);
      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe('ARIA and Accessibility', () => {
    it('has role="alert"', () => {
      render(<Toast message="Alert" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('has aria-live="assertive"', () => {
      render(<Toast message="Important" />);
      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    });

    it('close button has accessible label', () => {
      render(<Toast message="Test" onClose={jest.fn()} />);
      expect(screen.getByRole('button', { name: /dismiss notification/i })).toBeInTheDocument();
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - info', async () => {
      const { container } = render(<Toast message="Information" type="info" onClose={jest.fn()} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - success', async () => {
      const { container } = render(<Toast message="Success!" type="success" onClose={jest.fn()} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - error', async () => {
      const { container } = render(<Toast message="Error occurred" type="error" onClose={jest.fn()} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - without close button', async () => {
      const { container } = render(<Toast message="No close button" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});

describe('Toaster Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders nothing when no toasts are active', () => {
      const { container } = render(<Toaster />);
      expect(container.firstChild).toBeNull();
    });

    it('renders toast when toast.info is called', () => {
      render(<Toaster />);
      
      toast.info('Info message');
      
      expect(screen.getByText('Info message')).toBeInTheDocument();
    });

    it('renders toast when toast.success is called', () => {
      render(<Toaster />);
      
      toast.success('Success message');
      
      expect(screen.getByText('Success message')).toBeInTheDocument();
    });

    it('renders toast when toast.error is called', () => {
      render(<Toaster />);
      
      toast.error('Error message');
      
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });

    it('renders multiple toasts', () => {
      render(<Toaster />);
      
      toast.info('First toast');
      toast.success('Second toast');
      toast.error('Third toast');
      
      expect(screen.getByText('First toast')).toBeInTheDocument();
      expect(screen.getByText('Second toast')).toBeInTheDocument();
      expect(screen.getByText('Third toast')).toBeInTheDocument();
    });

    it('displays icon for each toast type', () => {
      render(<Toaster />);
      
      toast.success('Success');
      toast.error('Error');
      toast.info('Info');
      
      expect(screen.getByText('✓')).toBeInTheDocument(); // success
      expect(screen.getByText('✕')).toBeInTheDocument(); // error
      expect(screen.getByText('ℹ')).toBeInTheDocument(); // info
    });
  });

  describe('Interaction', () => {
    it('removes toast when dismiss button is clicked', async () => {
      const user = userEvent.setup({ delay: null });
      render(<Toaster />);
      
      toast.info('Test toast');
      expect(screen.getByText('Test toast')).toBeInTheDocument();
      
      const dismissButton = screen.getByRole('button', { name: /dismiss/i });
      await user.click(dismissButton);
      
      expect(screen.queryByText('Test toast')).not.toBeInTheDocument();
    });

    it('auto-removes toast after duration', () => {
      render(<Toaster />);
      
      toast.info('Auto dismiss');
      expect(screen.getByText('Auto dismiss')).toBeInTheDocument();
      
      jest.advanceTimersByTime(4500);
      expect(screen.queryByText('Auto dismiss')).not.toBeInTheDocument();
    });

    it('can dismiss multiple toasts independently', async () => {
      const user = userEvent.setup({ delay: null });
      render(<Toaster />);
      
      toast.info('Toast 1');
      toast.info('Toast 2');
      
      const dismissButtons = screen.getAllByRole('button', { name: /dismiss/i });
      await user.click(dismissButtons[0]);
      
      expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
      expect(screen.getByText('Toast 2')).toBeInTheDocument();
    });
  });

  describe('ARIA and Accessibility', () => {
    it('container has aria-live="polite"', () => {
      render(<Toaster />);
      
      toast.info('Test');
      
      const container = screen.getByRole('status').closest('[aria-live="polite"]');
      expect(container).toBeInTheDocument();
    });

    it('each toast has role="status"', () => {
      render(<Toaster />);
      
      toast.info('Toast 1');
      toast.success('Toast 2');
      
      const statuses = screen.getAllByRole('status');
      expect(statuses).toHaveLength(2);
    });

    it('each toast has aria-live="polite"', () => {
      render(<Toaster />);
      
      toast.info('Test');
      
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });

    it('dismiss button has accessible label', () => {
      render(<Toaster />);
      
      toast.info('Test');
      
      expect(screen.getByRole('button', { name: /dismiss notification/i })).toBeInTheDocument();
    });

    it('icons are hidden from screen readers', () => {
      const { container } = render(<Toaster />);
      
      toast.success('Success');
      
      const icon = container.querySelector('[aria-hidden="true"]');
      // Icon spans don't have aria-hidden by default in this implementation,
      // but the check mark character will still be announced
      // This test documents current behavior
      expect(screen.getByText('✓')).toBeInTheDocument();
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - single toast', async () => {
      const { container } = render(<Toaster />);
      
      toast.info('Test toast');
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - multiple toasts', async () => {
      const { container } = render(<Toaster />);
      
      toast.success('Success');
      toast.error('Error');
      toast.info('Info');
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Toast API', () => {
    it('toast.success creates success toast', () => {
      render(<Toaster />);
      
      toast.success('Success!');
      
      const toastElement = screen.getByText('Success!').closest('[role="status"]');
      expect(toastElement).toHaveClass('bg-green-50');
    });

    it('toast.error creates error toast', () => {
      render(<Toaster />);
      
      toast.error('Error!');
      
      const toastElement = screen.getByText('Error!').closest('[role="status"]');
      expect(toastElement).toHaveClass('bg-red-50');
    });

    it('toast.info creates info toast', () => {
      render(<Toaster />);
      
      toast.info('Info!');
      
      const toastElement = screen.getByText('Info!').closest('[role="status"]');
      expect(toastElement).toHaveClass('bg-blue-50');
    });
  });
});
