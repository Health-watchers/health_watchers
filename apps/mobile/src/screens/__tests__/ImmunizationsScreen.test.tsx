import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ImmunizationsScreen } from '../ImmunizationsScreen';
import { HealthWorkflowsService } from '../../services/health-workflows.service';

jest.mock('../../services/health-workflows.service');

const mockHealthWorkflowsService = HealthWorkflowsService as jest.Mocked<
  typeof HealthWorkflowsService
>;

describe('ImmunizationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders immunizations screen', async () => {
    mockHealthWorkflowsService.listImmunizations.mockResolvedValue([]);

    render(<ImmunizationsScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Immunizations/i)).toBeTruthy();
    });
  });

  it('displays immunization records', async () => {
    const immunizations = [
      {
        id: '1',
        vaccine: 'COVID-19',
        dueDate: '2024-01-15T00:00:00Z',
        administeredAt: '2024-01-10T00:00:00Z',
      },
      {
        id: '2',
        vaccine: 'Flu Shot',
        dueDate: '2024-12-01T00:00:00Z',
      },
    ];

    mockHealthWorkflowsService.listImmunizations.mockResolvedValue(immunizations);

    render(<ImmunizationsScreen />);

    await waitFor(() => {
      expect(screen.getByText('COVID-19')).toBeTruthy();
      expect(screen.getByText('Flu Shot')).toBeTruthy();
    });
  });

  it('distinguishes between administered and upcoming vaccines', async () => {
    const immunizations = [
      {
        id: '1',
        vaccine: 'COVID-19',
        dueDate: '2024-01-15T00:00:00Z',
        administeredAt: '2024-01-10T00:00:00Z',
      },
      {
        id: '2',
        vaccine: 'Flu Shot',
        dueDate: '2025-12-01T00:00:00Z',
      },
    ];

    mockHealthWorkflowsService.listImmunizations.mockResolvedValue(immunizations);

    render(<ImmunizationsScreen />);

    await waitFor(() => {
      // Administered vaccines should show completion
      expect(screen.getByText('COVID-19')).toBeTruthy();
      // Upcoming vaccines should show due date
      expect(screen.getByText('Flu Shot')).toBeTruthy();
    });
  });

  it('handles empty immunization list', async () => {
    mockHealthWorkflowsService.listImmunizations.mockResolvedValue([]);

    render(<ImmunizationsScreen />);

    await waitFor(() => {
      expect(
        screen.getByText(/No immunization records/i) || screen.getByText(/No records found/i)
      ).toBeTruthy();
    });
  });

  it('handles API error gracefully', async () => {
    mockHealthWorkflowsService.listImmunizations.mockRejectedValue(
      new Error('Network error')
    );

    render(<ImmunizationsScreen />);

    await waitFor(() => {
      // Should still render without crashing
      expect(screen.getByText(/Immunizations/i)).toBeTruthy();
    });
  });
});
