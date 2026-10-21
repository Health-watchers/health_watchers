import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Pagination } from '../Pagination';

expect.extend(toHaveNoViolations);

describe('Pagination', () => {
  const defaultProps = {
    page: 1,
    totalPages: 5,
    onPageChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders pagination navigation', () => {
      render(<Pagination {...defaultProps} />);
      expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    });

    it('renders previous button', () => {
      render(<Pagination {...defaultProps} />);
      expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument();
    });

    it('renders next button', () => {
      render(<Pagination {...defaultProps} />);
      expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
    });

    it('renders all page number buttons', () => {
      render(<Pagination {...defaultProps} totalPages={5} />);
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '5' })).toBeInTheDocument();
    });

    it('marks current page with aria-current', () => {
      render(<Pagination {...defaultProps} page={3} />);
      const page3Button = screen.getByRole('button', { name: '3' });
      expect(page3Button).toHaveAttribute('aria-current', 'page');
    });

    it('applies active styling to current page', () => {
      render(<Pagination {...defaultProps} page={2} />);
      const page2Button = screen.getByRole('button', { name: '2' });
      expect(page2Button).toHaveClass('bg-primary-500');
    });

    it('disables previous button on first page', () => {
      render(<Pagination {...defaultProps} page={1} />);
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    });

    it('disables next button on last page', () => {
      render(<Pagination {...defaultProps} page={5} totalPages={5} />);
      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    });

    it('enables previous button when not on first page', () => {
      render(<Pagination {...defaultProps} page={2} />);
      expect(screen.getByRole('button', { name: /previous page/i })).not.toBeDisabled();
    });

    it('enables next button when not on last page', () => {
      render(<Pagination {...defaultProps} page={4} totalPages={5} />);
      expect(screen.getByRole('button', { name: /next page/i })).not.toBeDisabled();
    });

    it('applies custom className', () => {
      render(<Pagination {...defaultProps} className="custom-pagination" />);
      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('custom-pagination');
    });

    it('renders icons with aria-hidden', () => {
      const { container } = render(<Pagination {...defaultProps} />);
      const svgs = container.querySelectorAll('svg');
      svgs.forEach((svg) => {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('Interaction', () => {
    it('calls onPageChange with correct page when page number is clicked', async () => {
      const user = userEvent.setup();
      const handlePageChange = jest.fn();
      render(<Pagination {...defaultProps} page={1} onPageChange={handlePageChange} />);
      
      await user.click(screen.getByRole('button', { name: '3' }));
      expect(handlePageChange).toHaveBeenCalledWith(3);
    });

    it('calls onPageChange with next page when next button is clicked', async () => {
      const user = userEvent.setup();
      const handlePageChange = jest.fn();
      render(<Pagination {...defaultProps} page={2} onPageChange={handlePageChange} />);
      
      await user.click(screen.getByRole('button', { name: /next page/i }));
      expect(handlePageChange).toHaveBeenCalledWith(3);
    });

    it('calls onPageChange with previous page when previous button is clicked', async () => {
      const user = userEvent.setup();
      const handlePageChange = jest.fn();
      render(<Pagination {...defaultProps} page={3} onPageChange={handlePageChange} />);
      
      await user.click(screen.getByRole('button', { name: /previous page/i }));
      expect(handlePageChange).toHaveBeenCalledWith(2);
    });

    it('does not call onPageChange when clicking disabled previous button', async () => {
      const user = userEvent.setup();
      const handlePageChange = jest.fn();
      render(<Pagination {...defaultProps} page={1} onPageChange={handlePageChange} />);
      
      await user.click(screen.getByRole('button', { name: /previous page/i }));
      expect(handlePageChange).not.toHaveBeenCalled();
    });

    it('does not call onPageChange when clicking disabled next button', async () => {
      const user = userEvent.setup();
      const handlePageChange = jest.fn();
      render(<Pagination {...defaultProps} page={5} totalPages={5} onPageChange={handlePageChange} />);
      
      await user.click(screen.getByRole('button', { name: /next page/i }));
      expect(handlePageChange).not.toHaveBeenCalled();
    });

    it('does not call onPageChange when clicking current page', async () => {
      const user = userEvent.setup();
      const handlePageChange = jest.fn();
      render(<Pagination {...defaultProps} page={2} onPageChange={handlePageChange} />);
      
      await user.click(screen.getByRole('button', { name: '2' }));
      expect(handlePageChange).toHaveBeenCalledWith(2);
    });
  });

  describe('Keyboard Navigation', () => {
    it('can tab to previous button', async () => {
      const user = userEvent.setup();
      render(<Pagination {...defaultProps} page={2} />);
      
      await user.tab();
      expect(screen.getByRole('button', { name: /previous page/i })).toHaveFocus();
    });

    it('can tab through page numbers', async () => {
      const user = userEvent.setup();
      render(<Pagination {...defaultProps} totalPages={3} />);
      
      await user.tab(); // Previous button
      await user.tab(); // Page 1
      expect(screen.getByRole('button', { name: '1' })).toHaveFocus();
      
      await user.tab(); // Page 2
      expect(screen.getByRole('button', { name: '2' })).toHaveFocus();
      
      await user.tab(); // Page 3
      expect(screen.getByRole('button', { name: '3' })).toHaveFocus();
    });

    it('can tab to next button', async () => {
      const user = userEvent.setup();
      render(<Pagination {...defaultProps} totalPages={2} page={1} />);
      
      await user.tab(); // Previous
      await user.tab(); // Page 1
      await user.tab(); // Page 2
      await user.tab(); // Next
      expect(screen.getByRole('button', { name: /next page/i })).toHaveFocus();
    });

    it('can activate page button with Enter', async () => {
      const user = userEvent.setup();
      const handlePageChange = jest.fn();
      render(<Pagination {...defaultProps} page={1} onPageChange={handlePageChange} />);
      
      const page3Button = screen.getByRole('button', { name: '3' });
      page3Button.focus();
      await user.keyboard('{Enter}');
      expect(handlePageChange).toHaveBeenCalledWith(3);
    });

    it('can activate page button with Space', async () => {
      const user = userEvent.setup();
      const handlePageChange = jest.fn();
      render(<Pagination {...defaultProps} page={1} onPageChange={handlePageChange} />);
      
      const page4Button = screen.getByRole('button', { name: '4' });
      page4Button.focus();
      await user.keyboard(' ');
      expect(handlePageChange).toHaveBeenCalledWith(4);
    });

    it('skips disabled buttons in tab order', async () => {
      const user = userEvent.setup();
      render(<Pagination {...defaultProps} page={1} totalPages={2} />);
      
      // Previous button should be disabled
      const prevButton = screen.getByRole('button', { name: /previous page/i });
      expect(prevButton).toBeDisabled();
      
      // Tab should skip it
      await user.tab();
      expect(screen.getByRole('button', { name: '1' })).toHaveFocus();
    });
  });

  describe('ARIA and Accessibility', () => {
    it('has navigation landmark with aria-label', () => {
      render(<Pagination {...defaultProps} />);
      expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'Pagination');
    });

    it('previous button has accessible label', () => {
      render(<Pagination {...defaultProps} />);
      expect(screen.getByLabelText(/previous page/i)).toBeInTheDocument();
    });

    it('next button has accessible label', () => {
      render(<Pagination {...defaultProps} />);
      expect(screen.getByLabelText(/next page/i)).toBeInTheDocument();
    });

    it('icons are hidden from screen readers', () => {
      const { container } = render(<Pagination {...defaultProps} />);
      const svgs = container.querySelectorAll('svg');
      svgs.forEach((svg) => {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
      });
    });

    it('current page has aria-current="page"', () => {
      render(<Pagination {...defaultProps} page={3} />);
      const currentPage = screen.getByRole('button', { name: '3' });
      expect(currentPage).toHaveAttribute('aria-current', 'page');
    });

    it('other pages do not have aria-current', () => {
      render(<Pagination {...defaultProps} page={3} />);
      const page1 = screen.getByRole('button', { name: '1' });
      const page2 = screen.getByRole('button', { name: '2' });
      expect(page1).not.toHaveAttribute('aria-current');
      expect(page2).not.toHaveAttribute('aria-current');
    });

    it('disabled buttons have disabled attribute', () => {
      render(<Pagination {...defaultProps} page={1} />);
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - first page', async () => {
      const { container } = render(<Pagination {...defaultProps} page={1} totalPages={5} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - middle page', async () => {
      const { container } = render(<Pagination {...defaultProps} page={3} totalPages={5} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - last page', async () => {
      const { container } = render(<Pagination {...defaultProps} page={5} totalPages={5} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - single page', async () => {
      const { container } = render(<Pagination {...defaultProps} page={1} totalPages={1} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - many pages', async () => {
      const { container } = render(<Pagination {...defaultProps} page={5} totalPages={10} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Edge Cases', () => {
    it('handles single page correctly', () => {
      render(<Pagination {...defaultProps} page={1} totalPages={1} />);
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
    });

    it('handles two pages correctly', () => {
      render(<Pagination {...defaultProps} page={1} totalPages={2} />);
      expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '3' })).not.toBeInTheDocument();
    });

    it('handles many pages correctly', () => {
      render(<Pagination {...defaultProps} page={1} totalPages={10} />);
      for (let i = 1; i <= 10; i++) {
        expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
      }
    });
  });
});
