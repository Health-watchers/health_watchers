'use client';

import { useState, useEffect } from 'react';
import { SchedulingCalendar } from './SchedulingCalendar';
import { formatScheduleDate } from '@/lib/utils';

interface TimeSlot {
  time: string;
  available: boolean;
  booked?: boolean;
}

interface AppointmentDraft {
  patientId: string;
  doctorId: string;
  scheduledAt: string;
  duration: number;
  type: string;
  isTelemedicine: boolean;
  chiefComplaint: string;
}

interface AppointmentBookingFormProps {
  onSubmit: (appointment: AppointmentDraft) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  doctors?: Array<{ id: string; name: string; specialty: string }>;
}

const APPOINTMENT_TYPES = ['Office visit', 'Telemedicine', 'Follow-up', 'Initial consultation'];
const DURATIONS = [15, 30, 45, 60];

export function AppointmentBookingForm({
  onSubmit,
  onCancel,
  isLoading,
  doctors = [],
}: AppointmentBookingFormProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppointmentDraft>({
    patientId: '',
    doctorId: doctors[0]?.id || '',
    scheduledAt: new Date().toISOString().slice(0, 16),
    duration: 30,
    type: APPOINTMENT_TYPES[0],
    isTelemedicine: false,
    chiefComplaint: '',
  });
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch available time slots for selected date
  useEffect(() => {
    const fetchTimeSlots = async () => {
      setLoadingSlots(true);
      try {
        // Simulate fetching available slots
        const slots: TimeSlot[] = [];
        for (let hour = 9; hour < 17; hour++) {
          slots.push({
            time: `${String(hour).padStart(2, '0')}:00`,
            available: true,
            booked: Math.random() > 0.7,
          });
          slots.push({
            time: `${String(hour).padStart(2, '0')}:30`,
            available: true,
            booked: Math.random() > 0.7,
          });
        }
        setTimeSlots(slots);
      } finally {
        setLoadingSlots(false);
      }
    };

    fetchTimeSlots();
  }, [selectedDate]);

  const handleSlotSelect = (time: string) => {
    setSelectedTime(time);
    const [hours, minutes] = time.split(':');
    const dateStr = selectedDate.toISOString().split('T')[0];
    setDraft((prev) => ({
      ...prev,
      scheduledAt: `${dateStr}T${hours}:${minutes}`,
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!draft.patientId.trim()) newErrors.patientId = 'Patient ID is required';
    if (!draft.doctorId.trim()) newErrors.doctorId = 'Doctor selection is required';
    if (!selectedTime) newErrors.scheduledAt = 'Please select a time slot';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      await onSubmit(draft);
    } catch (error) {
      console.error('Failed to book appointment:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Patient & Doctor selection */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="patient-id" className="mb-2 block text-sm font-medium text-gray-900">
            Patient ID *
          </label>
          <input
            id="patient-id"
            type="text"
            value={draft.patientId}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, patientId: e.target.value }));
              if (errors.patientId) setErrors((prev) => ({ ...prev, patientId: '' }));
            }}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.patientId ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Enter patient ID"
          />
          {errors.patientId && <p className="mt-1 text-xs text-red-600">{errors.patientId}</p>}
        </div>

        <div>
          <label htmlFor="doctor-id" className="mb-2 block text-sm font-medium text-gray-900">
            Clinician *
          </label>
          <select
            id="doctor-id"
            value={draft.doctorId}
            onChange={(e) => {
              setDraft((prev) => ({ ...prev, doctorId: e.target.value }));
              if (errors.doctorId) setErrors((prev) => ({ ...prev, doctorId: '' }));
            }}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.doctorId ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select a clinician</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                Dr. {doctor.name} ({doctor.specialty})
              </option>
            ))}
          </select>
          {errors.doctorId && <p className="mt-1 text-xs text-red-600">{errors.doctorId}</p>}
        </div>
      </div>

      {/* Appointment type and duration */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="type" className="mb-2 block text-sm font-medium text-gray-900">
            Appointment Type
          </label>
          <select
            id="type"
            value={draft.type}
            onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {APPOINTMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="duration" className="mb-2 block text-sm font-medium text-gray-900">
            Duration (minutes)
          </label>
          <select
            id="duration"
            value={draft.duration}
            onChange={(e) => setDraft((prev) => ({ ...prev, duration: Number(e.target.value) }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {DURATIONS.map((duration) => (
              <option key={duration} value={duration}>
                {duration} minutes
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Telemedicine checkbox */}
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={draft.isTelemedicine}
          onChange={(e) => setDraft((prev) => ({ ...prev, isTelemedicine: e.target.checked }))}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-gray-700">Video visit (telemedicine)</span>
      </label>

      {/* Chief complaint */}
      <div>
        <label htmlFor="complaint" className="mb-2 block text-sm font-medium text-gray-900">
          Chief Complaint
        </label>
        <textarea
          id="complaint"
          value={draft.chiefComplaint}
          onChange={(e) => setDraft((prev) => ({ ...prev, chiefComplaint: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Brief description of patient's concern"
          rows={3}
        />
      </div>

      {/* Calendar and time selection */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Select Date & Time</h3>
        {errors.scheduledAt && <p className="mb-4 text-xs text-red-600">{errors.scheduledAt}</p>}
        <SchedulingCalendar
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          timeSlots={timeSlots}
          onSlotSelect={handleSlotSelect}
          isLoading={loadingSlots}
        />
        {selectedTime && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              <strong>Selected:</strong> {formatScheduleDate(selectedDate)} at {selectedTime}
            </p>
          </div>
        )}
      </div>

      {/* Form actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Booking...' : 'Confirm Appointment'}
        </button>
      </div>
    </form>
  );
}
