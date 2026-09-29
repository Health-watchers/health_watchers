import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Input } from '../Input';

expect.extend(toHaveNoViolations);

describe('Input', () => {
  describe('Rendering', () => {
    it('renders with default props', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      expect(input).toBeInTheDocument();
    });

    it('renders with label', () => {
      render(<Input label="Username" />);
      expect(screen.getByLabelText('Username')).toBeInTheDocument();
    });

    it('renders with placeholder', () => {
      render(<Input placeholder="Enter your name" />);
      expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
    });

    it('renders with helper text', () => {
      render(<Input label="Email" helperText="We'll never share your email" />);
      expect(screen.getByText("We'll never share your email")).toBeInTheDocument();
    });

    it('renders with error message', () => {
      render(<Input label="Password" error="Password is required" />);
      const errorMessage = screen.getByText('Password is required');
      expect(errorMessage).toBeInTheDocument();
      expect(errorMessage).toHaveClass('text-danger-500');
    });

    it('does not show helper text when error is present', () => {
      render(
        <Input
          label="Email"
          helperText="Helper text"
          error="Error message"
        />
      );
      expect(screen.queryByText('Helper text')).not.toBeInTheDocument();
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });

    it('renders with left icon', () => {
      const LeftIcon = () => <span data-testid="left-icon">🔍</span>;
      render(<Input leftIcon={<LeftIcon />} />);
      expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    });

    it('renders with right icon', () => {
      const RightIcon = () => <span data-testid="right-icon">✓</span>;
      render(<Input rightIcon={<RightIcon />} />);
      expect(screen.getByTestId('right-icon')).toBeInTheDocument();
    });

    it('applies error styling when error prop is provided', () => {
      render(<Input error="Error" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('border-danger-500');
    });

    it('applies custom className', () => {
      render(<Input className="custom-class" />);
      expect(screen.getByRole('textbox')).toHaveClass('custom-class');
    });
  });

  describe('Interaction', () => {
    it('allows user to type', async () => {
      const user = userEvent.setup();
      render(<Input />);
      const input = screen.getByRole('textbox');
      
      await user.type(input, 'Hello World');
      expect(input).toHaveValue('Hello World');
    });

    it('calls onChange handler', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<Input onChange={handleChange} />);
      
      await user.type(screen.getByRole('textbox'), 'a');
      expect(handleChange).toHaveBeenCalled();
    });

    it('calls onFocus handler', async () => {
      const user = userEvent.setup();
      const handleFocus = jest.fn();
      render(<Input onFocus={handleFocus} />);
      
      await user.click(screen.getByRole('textbox'));
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('calls onBlur handler', async () => {
      const user = userEvent.setup();
      const handleBlur = jest.fn();
      render(<Input onBlur={handleBlur} />);
      
      const input = screen.getByRole('textbox');
      await user.click(input);
      await user.tab();
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('can be focused and blurred', async () => {
      const user = userEvent.setup();
      render(<Input />);
      const input = screen.getByRole('textbox');
      
      await user.click(input);
      expect(input).toHaveFocus();
      
      await user.tab();
      expect(input).not.toHaveFocus();
    });

    it('does not allow typing when disabled', async () => {
      const user = userEvent.setup();
      render(<Input disabled />);
      const input = screen.getByRole('textbox');
      
      await user.type(input, 'test');
      expect(input).toHaveValue('');
    });

    it('respects maxLength attribute', async () => {
      const user = userEvent.setup();
      render(<Input maxLength={5} />);
      const input = screen.getByRole('textbox');
      
      await user.type(input, '1234567890');
      expect(input).toHaveValue('12345');
    });
  });

  describe('Keyboard Navigation', () => {
    it('can be tabbed to', async () => {
      const user = userEvent.setup();
      render(
        <>
          <Input label="First" />
          <Input label="Second" />
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
          <Input label="First" />
          <Input label="Second" />
        </>
      );
      
      const secondInput = screen.getByLabelText('Second');
      secondInput.focus();
      
      await user.tab({ shift: true });
      expect(screen.getByLabelText('First')).toHaveFocus();
    });

    it('supports keyboard text selection (Ctrl+A)', async () => {
      const user = userEvent.setup();
      render(<Input defaultValue="Select me" />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      
      input.focus();
      await user.keyboard('{Control>}a{/Control}');
      
      // Check if text is selected
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe('Select me'.length);
    });
  });

  describe('ARIA and Accessibility', () => {
    it('associates label with input using htmlFor', () => {
      render(<Input label="Username" />);
      const input = screen.getByLabelText('Username');
      expect(input).toBeInTheDocument();
    });

    it('sets aria-invalid when error is present', () => {
      render(<Input error="Error message" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    });

    it('does not set aria-invalid when no error', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false');
    });

    it('associates error message with aria-describedby', () => {
      render(<Input label="Email" error="Email is required" />);
      const input = screen.getByRole('textbox');
      const errorId = input.getAttribute('aria-describedby');
      
      expect(errorId).toBeTruthy();
      expect(screen.getByText('Email is required')).toHaveAttribute('id', errorId!);
    });

    it('associates helper text with aria-describedby', () => {
      render(<Input label="Username" helperText="Choose a unique username" />);
      const input = screen.getByRole('textbox');
      const helperId = input.getAttribute('aria-describedby');
      
      expect(helperId).toBeTruthy();
      expect(screen.getByText('Choose a unique username')).toHaveAttribute('id', helperId!);
    });

    it('error message has role="alert" by default', () => {
      render(<Input error="Error" />);
      expect(screen.getByRole('alert')).toHaveTextContent('Error');
    });

    it('allows custom error role', () => {
      render(<Input error="Error" errorRole="status" />);
      expect(screen.getByRole('status')).toHaveTextContent('Error');
    });

    it('is disabled when disabled prop is true', () => {
      render(<Input disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('supports required attribute', () => {
      render(<Input required />);
      expect(screen.getByRole('textbox')).toBeRequired();
    });

    it('supports readonly attribute', () => {
      render(<Input readOnly />);
      expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - default', async () => {
      const { container } = render(<Input label="Default Input" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with error', async () => {
      const { container } = render(
        <Input label="Email" error="Email is required" />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with helper text', async () => {
      const { container } = render(
        <Input label="Username" helperText="Choose a unique username" />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - disabled', async () => {
      const { container } = render(<Input label="Disabled Input" disabled />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with icons', async () => {
      const { container } = render(
        <Input
          label="Search"
          leftIcon={<span>🔍</span>}
          rightIcon={<span>✓</span>}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Input Types', () => {
    it('supports type="email"', () => {
      render(<Input type="email" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');
    });

    it('supports type="password"', () => {
      render(<Input type="password" />);
      const input = screen.getByRole('textbox', { hidden: true });
      expect(input).toHaveAttribute('type', 'password');
    });

    it('supports type="number"', () => {
      render(<Input type="number" />);
      expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number');
    });

    it('supports type="tel"', () => {
      render(<Input type="tel" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'tel');
    });
  });
});
