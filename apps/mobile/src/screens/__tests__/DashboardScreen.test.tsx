import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { DashboardScreen } from '../DashboardScreen';
import { useAppointmentsWithCache } from '../../services/offline-cache.service';

jest.mock('../../services/offline-cache.service');

const mockUseAppointmentsWithCache = useAppointmentsWithCache as jest.MockedFunction<
  typeof useAppointmentsWithCache
>;

describe('DashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('displays loading indicator while fetching appointments', () => {
    mockUseAppointmentsWithCache.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    const { UNSAFE_getByType } = render(<DashboardScreen />);

    // Check for ActivityIndicator component
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('displays upcoming appointments', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
    const appointments = [
      {
        _id: '1',
        scheduledAt: futureDate,
        doctorName: 'Dr. Smith',
        status: 'scheduled',
      },
      {
        _id: '2',
        scheduledAt: futureDate,
        doctorName: 'Dr. Jones',
        status: 'confirmed',
      },
    ];

    mockUseAppointmentsWithCache.mockReturnValue({
      data: appointments,
      isLoading: false,
      error: null,
    } as any);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Upcoming Appointments/i)).toBeTruthy();
      expect(screen.getByText('Dr. Smith')).toBeTruthy();
      expect(screen.getByText('Dr. Jones')).toBeTruthy();
    });
  });

  it('displays "no appointments" message when list is empty', async () => {
    mockUseAppointmentsWithCache.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByText(/No upcoming appointments/i)).toBeTruthy();
    });
  });

  it('filters out past appointments', async () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // Yesterday
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow

    const appointments = [
      {
        _id: '1',
        scheduledAt: pastDate,
        doctorName: 'Dr. Past',
        status: 'completed',
      },
      {
        _id: '2',
        scheduledAt: futureDate,
        doctorName: 'Dr. Future',
        status: 'scheduled',
      },
    ];

    mockUseAppointmentsWithCache.mockReturnValue({
      data: appointments,
      isLoading: false,
      error: null,
    } as any);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.queryByText('Dr. Past')).toBeNull();
      expect(screen.getByText('Dr. Future')).toBeTruthy();
    });
  });

  it('limits displayed appointments to 3', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    const appointments = [
      { _id: '1', scheduledAt: futureDate, doctorName: 'Dr. One', status: 'scheduled' },
      { _id: '2', scheduledAt: futureDate, doctorName: 'Dr. Two', status: 'scheduled' },
      { _id: '3', scheduledAt: futureDate, doctorName: 'Dr. Three', status: 'scheduled' },
      { _id: '4', scheduledAt: futureDate, doctorName: 'Dr. Four', status: 'scheduled' },
    ];

    mockUseAppointmentsWithCache.mockReturnValue({
      data: appointments,
      isLoading: false,
      error: null,
    } as any);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByText('Dr. One')).toBeTruthy();
      expect(screen.getByText('Dr. Two')).toBeTruthy();
      expect(screen.getByText('Dr. Three')).toBeTruthy();
      expect(screen.queryByText('Dr. Four')).toBeNull();
    });
  });

  it('displays total appointment count in recent encounters section', async () => {
    const appointments = [
      {
        _id: '1',
        scheduledAt: new Date().toISOString(),
        doctorName: 'Dr. Smith',
        status: 'scheduled',
      },
      {
        _id: '2',
        scheduledAt: new Date().toISOString(),
        doctorName: 'Dr. Jones',
        status: 'scheduled',
      },
    ];

    mockUseAppointmentsWithCache.mockReturnValue({
      data: appointments,
      isLoading: false,
      error: null,
    } as any);

    render(<DashboardScreen />);

    await waitFor(() => {
      expect(screen.getByText(/2 total appointments/i)).toBeTruthy();
    });
  });
});
