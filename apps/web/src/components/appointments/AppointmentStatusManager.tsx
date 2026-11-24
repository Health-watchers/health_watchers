'use client';

import { useState } from 'react';

interface Appointment {
  _id: string;
  scheduledAt: string;
  type: string;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no-show' | 'patient_arrived';
  patientId: string;
  doctorId: string;
  duration: number;
  isTelemedicine?: boolean;
  chiefComplaint?: string;
}

interface AppointmentStatusManagerProps {
  appointment: Appointment;
  onStatusChange?: (newStatus: Appointment['status']) => Promise<void>;
  onReschedule?: (newDateTime: string) => Promise<void>;
  onCancel?: () => Promise<void>;
  isLoading?: boolean;
}

const STATUS_COLORS: Record<Appointment['status'], string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  completed: 'bg-purple-100 text-purple-800',
  'no-show': 'bg-orange-100 text-orange-800',
  patient_arrived: 'bg-indigo-100 text-indigo-800',
};

const ALLOWED_TRANSITIONS: Record<Appointment['status'], Appointment['status'][]> = {
  scheduled: ['confirmed', 'cancelled', 'no-show'],
  confirmed: ['patient_arrived', 'cancelled'],
  patient_arrived: ['completed', 'no-show'],
  completed: [],
  cancelled: [],
  'no-show': [],
};

export function AppointmentStatusManager({
  appointment,
  onStatusChange,
  onReschedule,
  onCancel,
  isLoading,
}: AppointmentStatusManagerProps) {
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [newDateTime, setNewDateTime] = useState(
    new Date(appointment.scheduledAt).toISOString().slice(0, 16)
  );
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const allowedStatuses = ALLOWED_TRANSITIONS[appointment.status] || [];

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleStatusChange = async (newStatus: Appointment['status']) => {
    setTransitionError(null);
    try {
      await onStatusChange?.(newStatus);
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : 'Failed to update status');
    }
  };

  const handleReschedule = async () => {
    if (!newDateTime) return;
    try {
      await onReschedule?.(newDateTime);
      setShowRescheduleForm(false);
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : 'Failed to reschedule');
    }
  };

  const handleCancel = async () => {
    try {
      await onCancel?.();
      setShowConfirmCancel(false);
    } catch (error) {
      setTransitionError(error instanceof Error ? error.message : 'Failed to cancel appointment');
    }
  };

  const isPastAppointment = new Date(appointment.scheduledAt) < new Date();

  return (
    <div className="space-y-4">
      {/* Current status */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600">Status:</span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[appointment.status]}`}
        >
          {appointment.status}
        </span>
      </div>

      {/* Appointment details */}
      <div className="space-y-2 rounded-lg bg-gray-50 p-4">
        <p className="text-sm">
          <span className="font-medium text-gray-700">Date & Time:</span>{' '}
          <span className="text-gray-600">{formatDateTime(appointment.scheduledAt)}</span>
        </p>
        <p className="text-sm">
          <span className="font-medium text-gray-700">Type:</span>{' '}
          <span className="text-gray-600">{appointment.type}</span>
        </p>
        <p className="text-sm">
          <span className="font-medium text-gray-700">Duration:</span>{' '}
          <span className="text-gray-600">{appointment.duration} minutes</span>
        </p>
        {appointment.isTelemedicine && (
          <p className="text-sm">
            <span className="font-medium text-gray-700">Format:</span>{' '}
            <span className="text-gray-600">Video Visit 🎥</span>
          </p>
        )}
        {appointment.chiefComplaint && (
          <p className="text-sm">
            <span className="font-medium text-gray-700">Chief Complaint:</span>{' '}
            <span className="text-gray-600">{appointment.chiefComplaint}</span>
          </p>
        )}
      </div>

      {/* Error message */}
      {transitionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {transitionError}
        </div>
      )}

      {/* Status transitions */}
      {allowedStatuses.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Update Status</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {allowedStatuses.map((status) => (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                disabled={isLoading}
                className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50"
              >
                Mark as {status}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reschedule section */}
      {!isPastAppointment &&
        appointment.status !== 'cancelled' &&
        appointment.status !== 'completed' && (
          <div className="border-t border-gray-200 pt-4">
            {!showRescheduleForm ? (
              <button
                onClick={() => setShowRescheduleForm(true)}
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                📅 Reschedule Appointment
              </button>
            ) : (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="new-datetime"
                    className="mb-2 block text-sm font-medium text-gray-700"
                  >
                    New Date & Time
                  </label>
                  <input
                    id="new-datetime"
                    type="datetime-local"
                    value={newDateTime}
                    onChange={(e) => setNewDateTime(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleReschedule}
                    disabled={isLoading}
                    className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Updating...' : 'Update'}
                  </button>
                  <button
                    onClick={() => setShowRescheduleForm(false)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      {/* Cancel section */}
      {appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
        <div className="border-t border-gray-200 pt-4">
          {!showConfirmCancel ? (
            <button
              onClick={() => setShowConfirmCancel(true)}
              className="text-sm font-medium text-red-600 hover:text-red-700"
            >
              🗑️ Cancel Appointment
            </button>
          ) : (
            <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">
                Are you sure you want to cancel this appointment?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isLoading ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
                <button
                  onClick={() => setShowConfirmCancel(false)}
                  className="flex-1 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  No, Keep It
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
