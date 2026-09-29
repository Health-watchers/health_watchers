import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Select, type SelectOption } from '../Select';

expect.extend(toHaveNoViolations);

const mockOptions: SelectOption[] = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
];

describe('Select', () => {
  describe('Rendering', () => {
    it('renders with default props', () => {
      render(<Select options={mockOptions} />);
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
    });

    it('renders with label', () => {
      render(<Select label="Country" options={mockOptions} />);
      expect(screen.getByLabelText('Country')).toBeInTheDocument();
    });

    it('renders all options', () => {
      render(<Select options={mockOptions} />);
      const select = screen.getByRole('combobox');
      const options = Array.from(select.querySelectorAll('option'));
      
      expect(options).toHaveLength(3);
      expect(options[0]).toHaveTextContent('Option 1');
      expect(options[1]).toHaveTextContent('Option 2');
      expect(options[2]).toHaveTextContent('Option 3');
    });

    it('renders with placeholder', () => {
      render(<Select options={mockOptions} placeholder="Select an option" />);
      expect(screen.getByText('Select an option')).toBeInTheDocument();
      
      const select = screen.getByRole('combobox');
      const firstOption = select.querySelector('option') as HTMLOptionElement;
      expect(firstOption.value).toBe('');
    });

    it('renders with helper text', () => {
      render(
        <Select
          label="Theme"
          options={mockOptions}
          helperText="Choose your preferred theme"
        />
      );
      expect(screen.getByText('Choose your preferred theme')).toBeInTheDocument();
    });

    it('renders with error message', () => {
      render(<Select label="Country" options={mockOptions} error="Country is required" />);
      const errorMessage = screen.getByText('Country is required');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveClass('text-danger-500');
    });

    it('does not show helper text when error is present', () => {
      render(
        <Select
          label="Country"
          options={mockOptions}
          helperText="Helper text"
          error="Error message"
        />
      );
      expect(screen.queryByText('Helper text')).not.toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });

    it('applies error styling when error prop is provided', () => {
      render(<Select options={mockOptions} error="Error" />);
      const select = screen.getByRole('combobox');
      expect(select).toHaveClass('border-danger-500');
    });

    it('applies custom className', () => {
      render(<Select options={mockOptions} className="custom-class" />);
      expect(screen.getByRole('combobox')).toHaveClass('custom-class');
    });

    it('renders chevron icon', () => {
      const { container } = render(<Select options={mockOptions} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Interaction', () => {
    it('allows user to select an option', async () => {
      const user = userEvent.setup();
      render(<Select options={mockOptions} />);
      const select = screen.getByRole('combobox');
      
      await user.selectOptions(select, 'option2');
      expect(select).toHaveValue('option2');
    });

    it('calls onChange handler when selection changes', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<Select options={mockOptions} onChange={handleChange} />);
      
      await user.selectOptions(screen.getByRole('combobox'), 'option1');
      expect(handleChange).toHaveBeenCalled();
    });

    it('calls onFocus handler', async () => {
      const user = userEvent.setup();
      const handleFocus = jest.fn();
      render(<Select options={mockOptions} onFocus={handleFocus} />);
      
      await user.click(screen.getByRole('combobox'));
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('calls onBlur handler', async () => {
      const user = userEvent.setup();
      const handleBlur = jest.fn();
      render(<Select options={mockOptions} onBlur={handleBlur} />);
      
      const select = screen.getByRole('combobox');
      await user.click(select);
      await user.tab();
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('can be focused and blurred', async () => {
      const user = userEvent.setup();
      render(<Select options={mockOptions} />);
      const select = screen.getByRole('combobox');
      
      await user.click(select);
      expect(select).toHaveFocus();
      
      await user.tab();
      expect(select).not.toHaveFocus();
    });

    it('does not allow selection when disabled', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<Select options={mockOptions} onChange={handleChange} disabled />);
      const select = screen.getByRole('combobox');
      
      await user.selectOptions(select, 'option1');
      expect(handleChange).not.toHaveBeenCalled();
    });

    it('respects defaultValue', () => {
      render(<Select options={mockOptions} defaultValue="option2" />);
      expect(screen.getByRole('combobox')).toHaveValue('option2');
    });

    it('respects controlled value', () => {
      const { rerender } = render(<Select options={mockOptions} value="option1" />);
      expect(screen.getByRole('combobox')).toHaveValue('option1');
      
      rerender(<Select options={mockOptions} value="option3" />);
      expect(screen.getByRole('combobox')).toHaveValue('option3');
    });
  });

  describe('Keyboard Navigation', () => {
    it('can be tabbed to', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Select label="First" options={mockOptions} />
          <Select label="Second" options={mockOptions} />
        </>
      );
      
      await user.tab();
      expect(screen.getByLabelText('First')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText('Second')).toHaveFocus();
    });

    it('can be shift-tabbed backwards', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Select label="First" options={mockOptions} />
          <Select label="Second" options={mockOptions} />
        </>
      );
      
      const secondSelect = screen.getByLabelText('Second');
      secondSelect.focus();
      
      await user.tab({ shift: true });
      expect(screen.getByLabelText('First')).toHaveFocus();
    });

    it('navigates options with arrow keys', async () => {
      const user = userEvent.setup();
      render(<Select options={mockOptions} />);
      const select = screen.getByRole('combobox');
      
      select.focus();
      await user.keyboard('{ArrowDown}');
      expect(select).toHaveValue('option1');
      
      await user.keyboard('{ArrowDown}');
      expect(select).toHaveValue('option2');
      
      await user.keyboard('{ArrowUp}');
      expect(select).toHaveValue('option1');
    });

    it('opens dropdown with Space when focused', async () => {
      const user = userEvent.setup();
      render(<Select options={mockOptions} />);
      const select = screen.getByRole('combobox');
      
      select.focus();
      await user.keyboard(' ');
      // Note: Native select behavior, just ensuring no errors
      expect(select).toHaveFocus();
    });

    it('opens dropdown with Enter when focused', async () => {
      const user = userEvent.setup();
      render(<Select options={mockOptions} />);
      const select = screen.getByRole('combobox');
      
      select.focus();
      await user.keyboard('{Enter}');
      // Note: Native select behavior, just ensuring no errors
      expect(select).toHaveFocus();
    });
  });

  describe('ARIA and Accessibility', () => {
    it('associates label with select using htmlFor', () => {
      render(<Select label="Country" options={mockOptions} />);
      const select = screen.getByLabelText('Country');
      expect(select).toBeInTheDocument();
    });

    it('sets aria-invalid when error is present', () => {
      render(<Select options={mockOptions} error="Error message" />);
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not set aria-invalid when no error', () => {
      render(<Select options={mockOptions} />);
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'false');
    });

    it('associates error message with aria-describedby', () => {
      render(<Select label="Country" options={mockOptions} error="Country is required" />);
      const select = screen.getByRole('combobox');
      const errorId = select.getAttribute('aria-describedby');
      
      expect(errorId).toBeTruthy();
      expect(screen.getByText('Country is required')).toHaveAttribute('id', errorId!);
    });

    it('associates helper text with aria-describedby', () => {
      render(
        <Select label="Theme" options={mockOptions} helperText="Choose your theme" />
      );
      const select = screen.getByRole('combobox');
      const helperId = select.getAttribute('aria-describedby');
      
      expect(helperId).toBeTruthy();
      expect(screen.getByText('Choose your theme')).toHaveAttribute('id', helperId!);
    });

    it('is disabled when disabled prop is true', () => {
      render(<Select options={mockOptions} disabled />);
      expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('supports required attribute', () => {
      render(<Select options={mockOptions} required />);
      expect(screen.getByRole('combobox')).toBeRequired();
    });

    it('chevron icon has aria-hidden', () => {
      const { container } = render(<Select options={mockOptions} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - default', async () => {
      const { container } = render(
        <Select label="Default Select" options={mockOptions} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with error', async () => {
      const { container } = render(
        <Select label="Country" options={mockOptions} error="Country is required" />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with helper text', async () => {
      const { container } = render(
        <Select
          label="Theme"
          options={mockOptions}
          helperText="Choose your preferred theme"
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - disabled', async () => {
      const { container } = render(
        <Select label="Disabled Select" options={mockOptions} disabled />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with placeholder', async () => {
      const { container } = render(
        <Select
          label="Country"
          options={mockOptions}
          placeholder="Select a country"
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Empty Options', () => {
    it('renders without options', () => {
      render(<Select options={[]} />);
      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();
      expect(select.querySelectorAll('option')).toHaveLength(0);
    });

    it('renders with only placeholder when options are empty', () => {
      render(<Select options={[]} placeholder="No options available" />);
      const select = screen.getByRole('combobox');
      const options = select.querySelectorAll('option');
      
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent('No options available');
    });
  });
});
