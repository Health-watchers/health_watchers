import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { OtpInput } from '../OtpInput';

expect.extend(toHaveNoViolations);

describe('OtpInput', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders 6 input fields', () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole('textbox');
      expect(inputs).toHaveLength(6);
    });

    it('renders empty inputs when value is empty', () => {
      render(<OtpInput {...defaultProps} value="" />);
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toHaveValue('');
      });
    });

    it('populates inputs with value digits', () => {
      render(<OtpInput {...defaultProps} value="123456" />);
      expect(screen.getByLabelText('Digit 1')).toHaveValue('1');
      expect(screen.getByLabelText('Digit 2')).toHaveValue('2');
      expect(screen.getByLabelText('Digit 3')).toHaveValue('3');
      expect(screen.getByLabelText('Digit 4')).toHaveValue('4');
      expect(screen.getByLabelText('Digit 5')).toHaveValue('5');
      expect(screen.getByLabelText('Digit 6')).toHaveValue('6');
    });

    it('handles partial values correctly', () => {
      render(<OtpInput {...defaultProps} value="123" />);
      expect(screen.getByLabelText('Digit 1')).toHaveValue('1');
      expect(screen.getByLabelText('Digit 2')).toHaveValue('2');
      expect(screen.getByLabelText('Digit 3')).toHaveValue('3');
      expect(screen.getByLabelText('Digit 4')).toHaveValue('');
      expect(screen.getByLabelText('Digit 5')).toHaveValue('');
      expect(screen.getByLabelText('Digit 6')).toHaveValue('');
    });

    it('renders error message when error prop is provided', () => {
      render(<OtpInput {...defaultProps} error="Invalid code" />);
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid code');
    });

    it('does not render error message when error is not provided', () => {
      render(<OtpInput {...defaultProps} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('applies error styling to inputs when error is present', () => {
      render(<OtpInput {...defaultProps} error="Error" />);
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toHaveClass('border-danger-500');
      });
    });

    it('disables all inputs when disabled prop is true', () => {
      render(<OtpInput {...defaultProps} disabled />);
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toBeDisabled();
      });
    });
  });

  describe('Typing Interaction', () => {
    it('calls onChange with new value when digit is entered', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={handleChange} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      await user.type(firstInput, '5');
      
      expect(handleChange).toHaveBeenCalledWith('5');
    });

    it('moves focus to next input after entering a digit', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={handleChange} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      const secondInput = screen.getByLabelText('Digit 2');
      
      await user.type(firstInput, '3');
      expect(secondInput).toHaveFocus();
    });

    it('allows typing full OTP sequentially', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={handleChange} />);
      
      await user.type(screen.getByLabelText('Digit 1'), '1');
      await user.type(screen.getByLabelText('Digit 2'), '2');
      await user.type(screen.getByLabelText('Digit 3'), '3');
      await user.type(screen.getByLabelText('Digit 4'), '4');
      await user.type(screen.getByLabelText('Digit 5'), '5');
      await user.type(screen.getByLabelText('Digit 6'), '6');
      
      expect(handleChange).toHaveBeenLastCalledWith('123456');
    });

    it('ignores non-numeric characters', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={handleChange} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      await user.type(firstInput, 'abc');
      
      expect(handleChange).not.toHaveBeenCalled();
      expect(firstInput).toHaveValue('');
    });

    it('replaces existing digit when typing in filled input', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<OtpInput {...defaultProps} value="123456" onChange={handleChange} />);
      
      const thirdInput = screen.getByLabelText('Digit 3');
      await user.clear(thirdInput);
      await user.type(thirdInput, '9');
      
      expect(handleChange).toHaveBeenCalledWith('129456');
    });

    it('does not allow input when disabled', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<OtpInput {...defaultProps} disabled onChange={handleChange} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      await user.type(firstInput, '5');
      
      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('moves focus to previous input on Backspace when current is empty', async () => {
      const user = userEvent.setup();
      render(<OtpInput {...defaultProps} value="12" />);
      
      const thirdInput = screen.getByLabelText('Digit 3');
      const secondInput = screen.getByLabelText('Digit 2');
      
      thirdInput.focus();
      await user.keyboard('{Backspace}');
      
      expect(secondInput).toHaveFocus();
    });

    it('moves focus to previous input with ArrowLeft', async () => {
      const user = userEvent.setup();
      render(<OtpInput {...defaultProps} value="123" />);
      
      const thirdInput = screen.getByLabelText('Digit 3');
      const secondInput = screen.getByLabelText('Digit 2');
      
      thirdInput.focus();
      await user.keyboard('{ArrowLeft}');
      
      expect(secondInput).toHaveFocus();
    });

    it('moves focus to next input with ArrowRight', async () => {
      const user = userEvent.setup();
      render(<OtpInput {...defaultProps} value="123" />);
      
      const secondInput = screen.getByLabelText('Digit 2');
      const thirdInput = screen.getByLabelText('Digit 3');
      
      secondInput.focus();
      await user.keyboard('{ArrowRight}');
      
      expect(thirdInput).toHaveFocus();
    });

    it('does not move focus beyond first input with ArrowLeft', async () => {
      const user = userEvent.setup();
      render(<OtpInput {...defaultProps} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      firstInput.focus();
      await user.keyboard('{ArrowLeft}');
      
      expect(firstInput).toHaveFocus();
    });

    it('does not move focus beyond last input with ArrowRight', async () => {
      const user = userEvent.setup();
      render(<OtpInput {...defaultProps} />);
      
      const lastInput = screen.getByLabelText('Digit 6');
      lastInput.focus();
      await user.keyboard('{ArrowRight}');
      
      expect(lastInput).toHaveFocus();
    });

    it('can tab through inputs', async () => {
      const user = userEvent.setup();
      render(<OtpInput {...defaultProps} />);
      
      await user.tab();
      expect(screen.getByLabelText('Digit 1')).toHaveFocus();
      
      await user.tab();
      expect(screen.getByLabelText('Digit 2')).toHaveFocus();
    });
  });

  describe('Paste Functionality', () => {
    it('populates all inputs when pasting 6 digits', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={handleChange} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      await user.click(firstInput);
      await user.paste('123456');
      
      expect(handleChange).toHaveBeenCalledWith('123456');
    });

    it('ignores non-numeric characters when pasting', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={handleChange} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      await user.click(firstInput);
      await user.paste('12ab34');
      
      expect(handleChange).toHaveBeenCalledWith('1234');
    });

    it('truncates pasted value to 6 digits', async () => {
      const user = userEvent.setup();
      const handleChange = jest.fn();
      render(<OtpInput {...defaultProps} onChange={handleChange} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      await user.click(firstInput);
      await user.paste('123456789');
      
      expect(handleChange).toHaveBeenCalledWith('123456');
    });

    it('focuses appropriate input after paste', async () => {
      const user = userEvent.setup();
      render(<OtpInput {...defaultProps} onChange={jest.fn()} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      await user.click(firstInput);
      await user.paste('123');
      
      // Should focus input after last pasted digit (index 3 = Digit 4)
      expect(screen.getByLabelText('Digit 4')).toHaveFocus();
    });

    it('focuses last input when pasting full code', async () => {
      const user = userEvent.setup();
      render(<OtpInput {...defaultProps} onChange={jest.fn()} />);
      
      const firstInput = screen.getByLabelText('Digit 1');
      await user.click(firstInput);
      await user.paste('123456');
      
      expect(screen.getByLabelText('Digit 6')).toHaveFocus();
    });
  });

  describe('ARIA and Accessibility', () => {
    it('each input has accessible label', () => {
      render(<OtpInput {...defaultProps} />);
      expect(screen.getByLabelText('Digit 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Digit 2')).toBeInTheDocument();
      expect(screen.getByLabelText('Digit 3')).toBeInTheDocument();
      expect(screen.getByLabelText('Digit 4')).toBeInTheDocument();
      expect(screen.getByLabelText('Digit 5')).toBeInTheDocument();
      expect(screen.getByLabelText('Digit 6')).toBeInTheDocument();
    });

    it('inputs have inputMode="numeric"', () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toHaveAttribute('inputMode', 'numeric');
      });
    });

    it('inputs have pattern attribute for numeric validation', () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toHaveAttribute('pattern', '[0-9]');
      });
    });

    it('inputs have maxLength attribute', () => {
      render(<OtpInput {...defaultProps} />);
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toHaveAttribute('maxLength', '1');
      });
    });

    it('error message has role="alert"', () => {
      render(<OtpInput {...defaultProps} error="Invalid code" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('disabled inputs have disabled attribute', () => {
      render(<OtpInput {...defaultProps} disabled />);
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toBeDisabled();
      });
    });
  });

  describe('Accessibility Violations', () => {
    it('should not have accessibility violations - empty', async () => {
      const { container } = render(<OtpInput {...defaultProps} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with value', async () => {
      const { container } = render(<OtpInput {...defaultProps} value="123456" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - with error', async () => {
      const { container } = render(<OtpInput {...defaultProps} error="Invalid code" />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should not have accessibility violations - disabled', async () => {
      const { container } = render(<OtpInput {...defaultProps} disabled />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('Edge Cases', () => {
    it('handles value longer than 6 digits', () => {
      render(<OtpInput {...defaultProps} value="123456789" />);
      expect(screen.getByLabelText('Digit 1')).toHaveValue('1');
      expect(screen.getByLabelText('Digit 6')).toHaveValue('6');
      // Only first 6 digits should be displayed
    });

    it('handles empty string value', () => {
      render(<OtpInput {...defaultProps} value="" />);
      const inputs = screen.getAllByRole('textbox');
      inputs.forEach((input) => {
        expect(input).toHaveValue('');
      });
    });

    it('handles value change from filled to empty', () => {
      const { rerender } = render(<OtpInput {...defaultProps} value="123456" />);
      expect(screen.getByLabelText('Digit 1')).toHaveValue('1');
      
      rerender(<OtpInput {...defaultProps} value="" />);
      expect(screen.getByLabelText('Digit 1')).toHaveValue('');
    });
  });
});
