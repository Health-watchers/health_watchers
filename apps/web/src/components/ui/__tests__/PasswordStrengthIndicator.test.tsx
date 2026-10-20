import { render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { PasswordStrengthIndicator } from '../PasswordStrengthIndicator';

expect.extend(toHaveNoViolations);

describe('PasswordStrengthIndicator', () => {
  describe('Rendering', () => {
    it('renders nothing when password is empty', () => {
      const { container } = render(<PasswordStrengthIndicator password="" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders progress bar when password is provided', () => {
      render(<PasswordStrengthIndicator password="test" />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('renders all 5 password rules', () => {
      render(<PasswordStrengthIndicator password="test" />);
      expect(screen.getByText('At least 8 characters')).toBeInTheDocument();
      expect(screen.getByText(/one uppercase letter/i)).toBeInTheDocument();
      expect(screen.getByText(/one lowercase letter/i)).toBeInTheDocument();
      expect(screen.getByText(/one digit/i)).toBeInTheDocument();
      expect(screen.getByText(/one special character/i)).toBeInTheDocument();
    });

    it('shows checkmark for satisfied rules', () => {
      render(<PasswordStrengthIndicator password="abcdefgh" />);
      const ruleItems = screen.getAllByRole('listitem');
      
      // "At least 8 characters" should be satisfied (✓)
      const lengthRule = ruleItems.find(item => 
        within(item).queryByText('At least 8 characters')
      );
      expect(lengthRule).toHaveTextContent('✓');
      
      // "One lowercase letter" should be satisfied (✓)
      const lowercaseRule = ruleItems.find(item => 
        within(item).queryByText(/one lowercase letter/i)
      );
      expect(lowercaseRule).toHaveTextContent('✓');
    });

    it('shows circle for unsatisfied rules', () => {
      render(<PasswordStrengthIndicator password="abc" />);
      const ruleItems = screen.getAllByRole('listitem');
      
      // "At least 8 characters" should be unsatisfied (○)
      const lengthRule = ruleItems.find(item => 
        within(item).queryByText('At least 8 characters')
      );
      expect(lengthRule).toHaveTextContent('○');
    });
  });

  describe('Progress Bar', () => {
    it('has proper ARIA attributes', () => {
      render(<PasswordStrengthIndicator password="Test123!" />);
      const progressBar = screen.getByRole('progressbar');
      
      expect(progressBar).toHaveAttribute('aria-label', 'Password strength');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
      expect(progressBar).toHaveAttribute('aria-valuemax', '5');
    });

    it('updates aria-valuenow based on satisfied rules', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="abc" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1'); // lowercase only
      
      rerender(<PasswordStrengthIndicator password="abcdefgh" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2'); // lowercase + length
      
      rerender(<PasswordStrengthIndicator password="Abcdefgh" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3'); // + uppercase
      
      rerender(<PasswordStrengthIndicator password="Abcdefgh1" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '4'); // + digit
      
      rerender(<PasswordStrengthIndicator password="Abcdefgh1!" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5'); // all satisfied
    });

    it('applies error color for weak passwords (0-40%)', () => {
      render(<PasswordStrengthIndicator password="abc" />); // 1/5 = 20%
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-error-500');
    });

    it('applies warning color for moderate passwords (41-60%)', () => {
      render(<PasswordStrengthIndicator password="abcABC12" />); // 3/5 = 60%
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-warning-500');
    });

    it('applies lighter warning color for good passwords (61-80%)', () => {
      render(<PasswordStrengthIndicator password="abcABC123" />); // 4/5 = 80%
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-warning-400');
    });

    it('applies success color for strong passwords (81-100%)', () => {
      render(<PasswordStrengthIndicator password="Abcdefgh1!" />); // 5/5 = 100%
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toHaveClass('bg-success-500');
    });

    it('adjusts width based on strength', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="a" />);
      expect(screen.getByRole('progressbar')).toHaveClass('w-1/5'); // 1/5 = 20%
      
      rerender(<PasswordStrengthIndicator password="aB" />);
      expect(screen.getByRole('progressbar')).toHaveClass('w-2/5'); // 2/5 = 40%
      
      rerender(<PasswordStrengthIndicator password="aB1" />);
      expect(screen.getByRole('progressbar')).toHaveClass('w-3/5'); // 3/5 = 60%
      
      rerender(<PasswordStrengthIndicator password="aB1!" />);
      expect(screen.getByRole('progressbar')).toHaveClass('w-4/5'); // 4/5 = 80%
      
      rerender(<PasswordStrengthIndicator password="aB1!abcd" />);
      expect(screen.getByRole('progressbar')).toHaveClass('w-full'); // 5/5 = 100%
    });
  });

  describe('Password Rules', () => {
    it('validates length requirement (8+ characters)', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="abc" />);
      const lengthRule = screen.getByText('At least 8 characters');
      expect(lengthRule).toHaveClass('text-neutral-500');
      
      rerender(<PasswordStrengthIndicator password="abcdefgh" />);
      expect(lengthRule).toHaveClass('text-success-600');
    });

    it('validates uppercase letter requirement', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="abc" />);
      const uppercaseRule = screen.getByText(/one uppercase letter/i);
      expect(uppercaseRule).toHaveClass('text-neutral-500');
      
      rerender(<PasswordStrengthIndicator password="Abc" />);
      expect(uppercaseRule).toHaveClass('text-success-600');
    });

    it('validates lowercase letter requirement', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="ABC" />);
      const lowercaseRule = screen.getByText(/one lowercase letter/i);
      expect(lowercaseRule).toHaveClass('text-neutral-500');
      
      rerender(<PasswordStrengthIndicator password="ABc" />);
      expect(lowercaseRule).toHaveClass('text-success-600');
    });

    it('validates digit requirement', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="abc" />);
      const digitRule = screen.getByText(/one digit/i);
      expect(digitRule).toHaveClass('text-neutral-500');
      
      rerender(<PasswordStrengthIndicator password="abc1" />);
      expect(digitRule).toHaveClass('text-success-600');
    });

    it('validates special character requirement', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="abc" />);
      const specialRule = screen.getByText(/one special character/i);
      expect(specialRule).toHaveClass('text-neutral-500');
      
      rerender(<PasswordStrengthIndicator password="abc!" />);
      expect(specialRule).toHaveClass('text-success-600');
    });

    it('accepts various special characters', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+'];
      
      specialChars.forEach(char => {
        const { unmount } = render(<PasswordStrengthIndicator password={`abc${char}`} />);
        const specialRule = screen.getByText(/one special character/i);
        expect(specialRule).toHaveClass('text-success-600');
        unmount();
      });
    });
  });

  describe('Visual Feedback', () => {
    it('applies success styling to satisfied rules', () => {
      render(<PasswordStrengthIndicator password="abcdefgh" />);
      const ruleItems = screen.getAllByRole('listitem');
      
      const satisfiedRules = ruleItems.filter(item => 
        item.textContent?.includes('✓')
      );
      
      satisfiedRules.forEach(rule => {
        expect(rule).toHaveClass('text-success-600');
      });
    });

    it('applies neutral styling to unsatisfied rules', () => {
      render(<PasswordStrengthIndicator password="abc" />);
      const ruleItems = screen.getAllByRole('listitem');
      
      const unsatisfiedRules = ruleItems.filter(item => 
        item.textContent?.includes('○')
      );
      
      unsatisfiedRules.forEach(rule => {
        expect(rule).toHaveClass('text-neutral-500');
      });
    });

    it('icon spans have aria-hidden', () => {
      const { container } = render(<PasswordStrengthIndicator password="Test123!" />);
      const ariaHiddenSpans = container.querySelectorAll('span[aria-hidden="true"]');
      expect(ariaHiddenSpans.length).toBeGreaterThan(0);
    });
  });

  describe('Live Region', () => {
    it('container has aria-live="polite"', () => {
      const { container } = render(<PasswordStrengthIndicator password="test" />);
      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });

    it('announces changes to screen readers', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="abc" />);
      const liveRegion = screen.getByRole('progressbar').closest('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
      
      rerender(<PasswordStrengthIndicator password="Abcdefgh1!" />);
      expect(liveRegion).toBeInTheDocument();
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - weak password', async () => {
      const { container } = render(<PasswordStrengthIndicator password="abc" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - moderate password', async () => {
      const { container } = render(<PasswordStrengthIndicator password="Abc123" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - strong password', async () => {
      const { container } = render(<PasswordStrengthIndicator password="Abcdefgh1!" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - empty password', async () => {
      const { container } = render(<PasswordStrengthIndicator password="" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Edge Cases', () => {
    it('handles very long passwords', () => {
      const longPassword = 'A'.repeat(100) + 'a1!';
      render(<PasswordStrengthIndicator password={longPassword} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    });

    it('handles single character passwords', () => {
      render(<PasswordStrengthIndicator password="a" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    });

    it('handles passwords with only special characters', () => {
      render(<PasswordStrengthIndicator password="!@#$%^&*()" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2'); // length + special
    });

    it('handles passwords with unicode characters', () => {
      render(<PasswordStrengthIndicator password="Password123!©" />);
      // Should still validate based on ASCII rules
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    });

    it('handles passwords with spaces', () => {
      render(<PasswordStrengthIndicator password="Pass Word 123!" />);
      // Spaces count as special characters
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    });

    it('transitions from empty to filled', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="" />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      
      rerender(<PasswordStrengthIndicator password="Test" />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('transitions from filled to empty', () => {
      const { rerender } = render(<PasswordStrengthIndicator password="Test" />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      
      rerender(<PasswordStrengthIndicator password="" />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });
});
