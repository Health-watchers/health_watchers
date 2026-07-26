import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CDSRulesList } from '@/components/cds/CDSRulesList';
import { CDSRuleForm } from '@/components/cds/CDSRuleForm';
import type { CDSRule } from '@/types/cds';

const mockRules: CDSRule[] = [
  {
    ruleId: 'rule_high_bp',
    name: 'High Blood Pressure Alert',
    description: 'Alert when blood pressure is critically high',
    category: 'vital_sign',
    trigger: 'encounter_create',
    conditions: { type: 'vital_sign', bloodPressure: { critical: true } },
    action: {
      type: 'alert',
      message: 'Patient has critically high blood pressure',
      severity: 'critical',
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const queryClient = new QueryClient();

describe('CDSRulesList', () => {
  it('renders empty state when no rules', () => {
    render(
      <CDSRulesList
        rules={[]}
        onEdit={jest.fn()}
        onTest={jest.fn()}
        onDelete={jest.fn()}
        isDeleting={false}
      />
    );
    expect(screen.getByText(/No CDS rules configured yet/i)).toBeInTheDocument();
  });

  it('renders rules with all details', () => {
    render(
      <CDSRulesList
        rules={mockRules}
        onEdit={jest.fn()}
        onTest={jest.fn()}
        onDelete={jest.fn()}
        isDeleting={false}
      />
    );
    expect(screen.getByText('High Blood Pressure Alert')).toBeInTheDocument();
    expect(screen.getByText(/Alert when blood pressure is critically high/i)).toBeInTheDocument();
    expect(screen.getByText(/vital sign/i)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const onEdit = jest.fn();
    render(
      <CDSRulesList
        rules={mockRules}
        onEdit={onEdit}
        onTest={jest.fn()}
        onDelete={jest.fn()}
        isDeleting={false}
      />
    );
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(mockRules[0]);
  });

  it('calls onTest when test button is clicked', async () => {
    const onTest = jest.fn();
    render(
      <CDSRulesList
        rules={mockRules}
        onEdit={jest.fn()}
        onTest={onTest}
        onDelete={jest.fn()}
        isDeleting={false}
      />
    );
    fireEvent.click(screen.getByText('Test'));
    expect(onTest).toHaveBeenCalledWith(mockRules[0]);
  });

  it('calls onDelete when delete button is clicked', async () => {
    const onDelete = jest.fn();
    render(
      <CDSRulesList
        rules={mockRules}
        onEdit={jest.fn()}
        onTest={jest.fn()}
        onDelete={onDelete}
        isDeleting={false}
      />
    );
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('rule_high_bp');
  });

  it('disables delete button when isDeleting is true', () => {
    render(
      <CDSRulesList
        rules={mockRules}
        onEdit={jest.fn()}
        onTest={jest.fn()}
        onDelete={jest.fn()}
        isDeleting={true}
      />
    );
    expect(screen.getByText('Delete')).toBeDisabled();
  });
});

describe('CDSRuleForm', () => {
  it('renders form with empty fields for new rule', () => {
    render(<CDSRuleForm onSubmit={jest.fn()} onCancel={jest.fn()} isLoading={false} />);
    expect(screen.getByDisplayValue(/rule_/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Name')).toHaveValue('');
  });

  it('renders form with initial values for editing', () => {
    render(
      <CDSRuleForm
        initialRule={mockRules[0]}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        isLoading={false}
      />
    );
    expect(screen.getByDisplayValue('High Blood Pressure Alert')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/Alert when blood pressure is critically high/i)
    ).toBeInTheDocument();
  });

  it('calls onSubmit with form data', async () => {
    const onSubmit = jest.fn();
    const user = userEvent.setup();
    render(<CDSRuleForm onSubmit={onSubmit} onCancel={jest.fn()} isLoading={false} />);

    await user.type(screen.getByPlaceholderText('Name'), 'Test Rule');
    await user.type(screen.getByPlaceholderText('Description'), 'Test description');

    fireEvent.click(screen.getByText('Save Rule'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(<CDSRuleForm onSubmit={jest.fn()} onCancel={onCancel} isLoading={false} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables submit button when isLoading is true', () => {
    render(<CDSRuleForm onSubmit={jest.fn()} onCancel={jest.fn()} isLoading={true} />);
    expect(screen.getByText('Saving…')).toBeDisabled();
  });

  it('validates JSON in conditions field', async () => {
    const onSubmit = jest.fn();
    const user = userEvent.setup();
    render(<CDSRuleForm onSubmit={onSubmit} onCancel={jest.fn()} isLoading={false} />);

    // Fill required fields
    await user.type(screen.getByPlaceholderText('Name'), 'Test Rule');
    await user.type(screen.getByPlaceholderText('Description'), 'Test description');

    // Enter invalid JSON
    const conditionsTextarea = screen.getByDisplayValue('{}');
    await user.clear(conditionsTextarea);
    await user.type(conditionsTextarea, '{ invalid json }');

    fireEvent.click(screen.getByText('Save Rule'));

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON in conditions')).toBeInTheDocument();
    });
  });

  it('disables ruleId field when editing', () => {
    render(
      <CDSRuleForm
        initialRule={mockRules[0]}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        isLoading={false}
      />
    );
    expect(screen.getByDisplayValue('rule_high_bp')).toBeDisabled();
  });
});
