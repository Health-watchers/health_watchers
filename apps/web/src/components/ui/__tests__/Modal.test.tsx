import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Modal } from '../Modal';

expect.extend(toHaveNoViolations);

describe('Modal', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    children: <div>Modal content</div>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders when open is true', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('does not render when open is false', () => {
      render(<Modal {...defaultProps} open={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders with title', () => {
      render(<Modal {...defaultProps} title="Test Title" />);
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'modal-title');
    });

    it('renders with description', () => {
      render(<Modal {...defaultProps} description="Test description" />);
      expect(screen.getByText('Test description')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-describedby', 'modal-description');
    });

    it('renders with both title and description', () => {
      render(
        <Modal
          {...defaultProps}
          title="Title"
          description="Description"
        />
      );
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('renders close button', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('applies small size class', () => {
      render(<Modal {...defaultProps} size="sm" />);
      expect(screen.getByRole('dialog')).toHaveClass('max-w-sm');
    });

    it('applies medium size class by default', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toHaveClass('max-w-lg');
    });

    it('applies large size class', () => {
      render(<Modal {...defaultProps} size="lg" />);
      expect(screen.getByRole('dialog')).toHaveClass('max-w-2xl');
    });

    it('applies custom className', () => {
      render(<Modal {...defaultProps} className="custom-class" />);
      expect(screen.getByRole('dialog')).toHaveClass('custom-class');
    });

    it('renders backdrop', () => {
      const { container } = render(<Modal {...defaultProps} />);
      const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/40');
      expect(backdrop).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();
      render(<Modal {...defaultProps} onClose={handleClose} />);
      
      await user.click(screen.getByRole('button', { name: /close/i }));
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop is clicked', async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();
      const { container } = render(<Modal {...defaultProps} onClose={handleClose} />);
      
      const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/40') as HTMLElement;
      await user.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();
      render(<Modal {...defaultProps} onClose={handleClose} />);
      
      await user.keyboard('{Escape}');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not call onClose when modal content is clicked', async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();
      render(<Modal {...defaultProps} onClose={handleClose} />);
      
      await user.click(screen.getByRole('dialog'));
      expect(handleClose).not.toHaveBeenCalled();
    });
  });

  describe('Focus Management', () => {
    it('focuses the modal container when opened', () => {
      render(<Modal {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveFocus();
    });

    it('traps focus within modal (Tab)', async () => {
      const user = userEvent.setup();
      render(
        <Modal {...defaultProps}>
          <button>First</button>
          <button>Second</button>
          <button>Third</button>
        </Modal>
      );
      
      const firstButton = screen.getByRole('button', { name: 'First' });
      const secondButton = screen.getByRole('button', { name: 'Second' });
      const thirdButton = screen.getByRole('button', { name: 'Third' });
      const closeButton = screen.getByRole('button', { name: /close/i });
      
      firstButton.focus();
      expect(firstButton).toHaveFocus();
      
      await user.tab();
      expect(secondButton).toHaveFocus();
      
      await user.tab();
      expect(thirdButton).toHaveFocus();
      
      await user.tab();
      expect(closeButton).toHaveFocus();
      
      // Tab from last element should cycle to first
      await user.tab();
      expect(firstButton).toHaveFocus();
    });

    it('traps focus within modal (Shift+Tab)', async () => {
      const user = userEvent.setup();
      render(
        <Modal {...defaultProps}>
          <button>First</button>
          <button>Second</button>
        </Modal>
      );
      
      const firstButton = screen.getByRole('button', { name: 'First' });
      const closeButton = screen.getByRole('button', { name: /close/i });
      
      firstButton.focus();
      
      // Shift+Tab from first element should cycle to last
      await user.tab({ shift: true });
      expect(closeButton).toHaveFocus();
    });

    it('restores focus to previous element on close', () => {
      const { rerender } = render(
        <>
          <button>Trigger</button>
          <Modal {...defaultProps} open={false} />
        </>
      );
      
      const trigger = screen.getByRole('button', { name: 'Trigger' });
      trigger.focus();
      expect(trigger).toHaveFocus();
      
      // Open modal
      rerender(
        <>
          <button>Trigger</button>
          <Modal {...defaultProps} open={true} />
        </>
      );
      
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveFocus();
      
      // Close modal
      rerender(
        <>
          <button>Trigger</button>
          <Modal {...defaultProps} open={false} />
        </>
      );
      
      expect(trigger).toHaveFocus();
    });
  });

  describe('Body Scroll Lock', () => {
    it('prevents body scroll when modal is open', () => {
      render(<Modal {...defaultProps} />);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scroll when modal is closed', () => {
      const { rerender } = render(<Modal {...defaultProps} open={true} />);
      expect(document.body.style.overflow).toBe('hidden');
      
      rerender(<Modal {...defaultProps} open={false} />);
      expect(document.body.style.overflow).toBe('');
    });

    it('restores body scroll on unmount', () => {
      const { unmount } = render(<Modal {...defaultProps} />);
      expect(document.body.style.overflow).toBe('hidden');
      
      unmount();
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('Keyboard Navigation', () => {
    it('close button can be focused and activated with Enter', async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();
      render(<Modal {...defaultProps} onClose={handleClose} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      closeButton.focus();
      
      await user.keyboard('{Enter}');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('close button can be activated with Space', async () => {
      const user = userEvent.setup();
      const handleClose = jest.fn();
      render(<Modal {...defaultProps} onClose={handleClose} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      closeButton.focus();
      
      await user.keyboard(' ');
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('ARIA and Accessibility', () => {
    it('has role="dialog"', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal="true"', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('associates title with aria-labelledby', () => {
      render(<Modal {...defaultProps} title="Modal Title" />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
      expect(screen.getByText('Modal Title')).toHaveAttribute('id', 'modal-title');
    });

    it('associates description with aria-describedby', () => {
      render(<Modal {...defaultProps} description="Modal description" />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-describedby', 'modal-description');
      expect(screen.getByText('Modal description')).toHaveAttribute('id', 'modal-description');
    });

    it('backdrop has aria-hidden="true"', () => {
      const { container } = render(<Modal {...defaultProps} />);
      const backdrop = container.querySelector('.fixed.inset-0.bg-black\\/40');
      expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    });

    it('close button has accessible label', () => {
      render(<Modal {...defaultProps} />);
      expect(screen.getByRole('button', { name: /close/i })).toHaveAttribute('aria-label', 'Close');
    });

    it('close button icon has aria-hidden', () => {
      const { container } = render(<Modal {...defaultProps} />);
      const closeButton = screen.getByRole('button', { name: /close/i });
      const svg = closeButton.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('can be focused via tabIndex', () => {
      render(<Modal {...defaultProps} />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('tabIndex', '-1');
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - default', async () => {
      const { container } = render(
        <Modal {...defaultProps} title="Accessible Modal">
          <p>Modal content</p>
        </Modal>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with description', async () => {
      const { container } = render(
        <Modal
          {...defaultProps}
          title="Title"
          description="Description text"
        >
          <p>Content</p>
        </Modal>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with interactive content', async () => {
      const { container } = render(
        <Modal {...defaultProps} title="Form Modal">
          <form>
            <label htmlFor="name">Name</label>
            <input id="name" type="text" />
            <button type="submit">Submit</button>
          </form>
        </Modal>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - all sizes', async () => {
      const { container, rerender } = render(
        <Modal {...defaultProps} title="Small" size="sm">
          <p>Content</p>
        </Modal>
      );
      let results = await axe(container);
      expect(results).toHaveNoViolations();

      rerender(
        <Modal {...defaultProps} title="Medium" size="md">
          <p>Content</p>
        </Modal>
      );
      results = await axe(container);
      expect(results).toHaveNoViolations();

      rerender(
        <Modal {...defaultProps} title="Large" size="lg">
          <p>Content</p>
        </Modal>
      );
      results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
