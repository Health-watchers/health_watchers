import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatePatientForm, type CreatePatientData } from '../CreatePatientForm';

describe('CreatePatientForm validation', () => {
  it('shows an associated field error when a required field blurs empty', async () => {
    const user = userEvent.setup();
    render(<CreatePatientForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    const firstName = screen.getByLabelText(/first name/i);
    await user.click(firstName);
    await user.tab();

    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(firstName).toHaveAttribute('aria-invalid', 'true');
    expect(firstName).toHaveAttribute('aria-describedby', 'first-name-error');
  });

  it('locks submission while pending and shows the server failure summary', async () => {
    const user = userEvent.setup();
    let rejectSubmission: (error: Error) => void = () => {};
    const onSubmit = jest.fn(async (_data: CreatePatientData) => {
      await new Promise<void>((_resolve, reject) => {
        rejectSubmission = reject;
      });
    });
    render(<CreatePatientForm onSubmit={onSubmit} onCancel={jest.fn()} />);

    await user.type(screen.getByLabelText(/first name/i), 'Ada');
    await user.type(screen.getByLabelText(/last name/i), 'Lovelace');
    fireEvent.change(screen.getByLabelText(/date of birth/i), {
      target: { value: '1815-12-10' },
    });
    await user.type(screen.getByLabelText(/contact number/i), '5550100');
    await user.type(screen.getByLabelText(/address/i), '12 Analytical Engine Way');

    const submitButton = screen.getByRole('button', { name: /save patient/i });
    await user.click(submitButton);
    await waitFor(() => expect(submitButton).toBeDisabled());

    await act(async () => {
      rejectSubmission(new Error('Patient service unavailable'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Patient service unavailable');
    expect(submitButton).not.toBeDisabled();
  });
});
