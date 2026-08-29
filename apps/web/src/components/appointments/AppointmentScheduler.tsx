'use client';

import { useState, useEffect } from 'react';
import { SchedulingCalendar } from './SchedulingCalendar';

interface TimeSlot {
  time: string;
  available: boolean;
  booked?: boolean;
}

interface Location {
  id: string;
  name: string;
  address: string;
  isTelemedicine?: boolean;
}

interface Provider {
  id: string;
  name: string;
  specialty: string;
  avatar?: string;
}

interface AppointmentType {
  id: string;
  name: string;
  duration: number;
  description: string;
}

interface AppointmentDraft {
  patientId: string;
  providerId: string;
  appointmentTypeId: string;
  scheduledAt: string;
  duration: number;
  reasonForVisit: string;
  locationId: string;
  isTelemedicine: boolean;
  reminderPreference: 'email' | 'sms' | 'both';
  notes?: string;
}

interface WaitlistEntry {
  id: string;
  patientId: string;
  appointmentTypeId: string;
  providerId: string;
  addedAt: string;
}

interface AppointmentSchedulerProps {
  onSubmit: (appointment: AppointmentDraft) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  providers?: Provider[];
  locations?: Location[];
  appointmentTypes?: AppointmentType[];
}

export function AppointmentScheduler({
  onSubmit,
  onCancel,
  isLoading,
  providers = [],
  locations = [],
  appointmentTypes = [],
}: AppointmentSchedulerProps) {
  const [step, setStep] = useState<'type' | 'provider' | 'location' | 'datetime' | 'confirm'>(
    'type'
  );
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppointmentDraft>({
    patientId: '',
    providerId: providers[0]?.id || '',
    appointmentTypeId: appointmentTypes[0]?.id || '',
    scheduledAt: new Date().toISOString().slice(0, 16),
    duration: appointmentTypes[0]?.duration || 30,
    reasonForVisit: '',
    locationId: locations[0]?.id || '',
    isTelemedicine: false,
    reminderPreference: 'email',
  });

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [joinWaitlist, setJoinWaitlist] = useState(false);
  const [showTimezoneInfo, setShowTimezoneInfo] = useState(false);

  const selectedType = appointmentTypes.find((t) => t.appointmentTypeId === draft.appointmentTypeId);
  const selectedProvider = providers.find((p) => p.id === draft.providerId);
  const selectedLocation = locations.find((l) => l.id === draft.locationId);

  // Fetch time slots
  useEffect(() => {
    const fetchTimeSlots = async () => {
      setLoadingSlots(true);
      try {
        // Simulate API call
        const slots: TimeSlot[] = [];
        for (let hour = 9; hour < 17; hour++) {
          slots.push({
            time: `${String(hour).padStart(2, '0')}:00`,
            available: true,
            booked: Math.random() > 0.6,
          });
          slots.push({
            time: `${String(hour).padStart(2, '0')}:30`,
            available: true,
            booked: Math.random() > 0.6,
          });
        }
        setTimeSlots(slots);
      } finally {
        setLoadingSlots(false);
      }
    };

    if (step === 'datetime') {
      fetchTimeSlots();
    }
  }, [selectedDate, step, draft.providerId]);

  const handleSlotSelect = (time: string) => {
    setSelectedTime(time);
    const [hours, minutes] = time.split(':');
    const dateStr = selectedDate.toISOString().split('T')[0];
    setDraft((prev) => ({
      ...prev,
      scheduledAt: `${dateStr}T${hours}:${minutes}`,
    }));
  };

  const validateStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    switch (step) {
      case 'type':
        if (!draft.appointmentTypeId) newErrors.appointmentTypeId = 'Please select appointment type';
        break;
      case 'provider':
        if (!draft.providerId) newErrors.providerId = 'Please select a provider';
        break;
      case 'location':
        if (!draft.locationId && !draft.isTelemedicine) {
          newErrors.locationId = 'Please select location or choose telemedicine';
        }
        break;
      case 'datetime':
        if (!selectedTime) newErrors.scheduledAt = 'Please select a time slot';
        if (!draft.reasonForVisit.trim()) newErrors.reasonForVisit = 'Please provide reason for visit';
        break;
      case 'confirm':
        if (!draft.patientId.trim()) newErrors.patientId = 'Patient ID is required';
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextStep = () => {
    if (!validateStep()) return;

    const steps: Array<'type' | 'provider' | 'location' | 'datetime' | 'confirm'> = [
      'type',
      'provider',
      'location',
      'datetime',
      'confirm',
    ];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const handlePrevStep = () => {
    const steps: Array<'type' | 'provider' | 'location' | 'datetime' | 'confirm'> = [
      'type',
      'provider',
      'location',
      'datetime',
      'confirm',
    ];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep()) return;

    try {
      await onSubmit(draft);
    } catch (error) {
      console.error('Failed to schedule appointment:', error);
    }
  };

  const renderProgressBar = () => {
    const steps = ['type', 'provider', 'location', 'datetime', 'confirm'];
    const currentIndex = steps.indexOf(step);
    const progress = ((currentIndex + 1) / steps.length) * 100;

    return (
      <div className="mb-6">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-600">
          <span>Step {currentIndex + 1} of 5</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-gray-900">Schedule Appointment</h2>

      {renderProgressBar()}

      {/* Appointment Type Selection */}
      {step === 'type' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Appointment Type</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {appointmentTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  setDraft((prev) => ({
                    ...prev,
                    appointmentTypeId: type.id,
                    duration: type.duration,
                  }));
                  if (errors.appointmentTypeId) setErrors((prev) => ({ ...prev, appointmentTypeId: '' }));
                }}
                className={`rounded-lg border-2 p-4 text-left transition-all ${
                  draft.appointmentTypeId === type.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold text-gray-900">{type.name}</p>
                <p className="text-xs text-gray-600">{type.duration} minutes</p>
                <p className="mt-2 text-sm text-gray-700">{type.description}</p>
              </button>
            ))}
          </div>
          {errors.appointmentTypeId && (
            <p className="text-sm text-red-600">{errors.appointmentTypeId}</p>
          )}
        </div>
      )}

      {/* Provider Selection */}
      {step === 'provider' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Healthcare Provider</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.map((provider) => (
              <button
                key={provider.id}
                type="button"
                onClick={() => {
                  setDraft((prev) => ({ ...prev, providerId: provider.id }));
                  if (errors.providerId) setErrors((prev) => ({ ...prev, providerId: '' }));
                }}
                className={`rounded-lg border-2 p-4 text-left transition-all ${
                  draft.providerId === provider.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold text-gray-900">{provider.name}</p>
                <p className="text-xs text-gray-600">{provider.specialty}</p>
                {provider.avatar && (
                  <img
                    src={provider.avatar}
                    alt={provider.name}
                    className="mt-2 h-10 w-10 rounded-full"
                  />
                )}
              </button>
            ))}
          </div>
          {errors.providerId && <p className="text-sm text-red-600">{errors.providerId}</p>}
        </div>
      )}

      {/* Location Selection */}
      {step === 'location' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Location</h3>

          <label className="flex items-center gap-3 rounded-lg border border-gray-300 p-4 cursor-pointer hover:bg-gray-50">
            <input
              type="checkbox"
              checked={draft.isTelemedicine}
              onChange={(e) => {
                setDraft((prev) => ({
                  ...prev,
                  isTelemedicine: e.target.checked,
                }));
                if (e.target.checked && errors.locationId) {
                  setErrors((prev) => ({ ...prev, locationId: '' }));
                }
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <div>
              <p className="font-semibold text-gray-900">Telemedicine (Video Visit)</p>
              <p className="text-sm text-gray-600">Consult from home via video call</p>
            </div>
          </label>

          {!draft.isTelemedicine && (
            <div className="grid gap-3 sm:grid-cols-2">
              {locations.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  onClick={() => {
                    setDraft((prev) => ({ ...prev, locationId: location.id }));
                    if (errors.locationId) setErrors((prev) => ({ ...prev, locationId: '' }));
                  }}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${
                    draft.locationId === location.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{location.name}</p>
                  <p className="text-sm text-gray-600">{location.address}</p>
                </button>
              ))}
            </div>
          )}

          {errors.locationId && <p className="text-sm text-red-600">{errors.locationId}</p>}
        </div>
      )}

      {/* Date & Time Selection */}
      {step === 'datetime' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Date & Time</h3>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <SchedulingCalendar
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              timeSlots={timeSlots}
              onSlotSelect={handleSlotSelect}
              isLoading={loadingSlots}
            />
          </div>

          {selectedTime && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">
                Selected: {selectedDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                at {selectedTime}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Reason for Visit *
              </label>
              <textarea
                value={draft.reasonForVisit}
                onChange={(e) => {
                  setDraft((prev) => ({ ...prev, reasonForVisit: e.target.value }));
                  if (errors.reasonForVisit) setErrors((prev) => ({ ...prev, reasonForVisit: '' }));
                }}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.reasonForVisit ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Brief description of your concern"
                rows={3}
              />
              {errors.reasonForVisit && (
                <p className="text-xs text-red-600 mt-1">{errors.reasonForVisit}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Additional Notes (Optional)
              </label>
              <textarea
                value={draft.notes || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any other information..."
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Appointment Reminders
              </label>
              <select
                value={draft.reminderPreference}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    reminderPreference: e.target.value as 'email' | 'sms' | 'both',
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="email">Email reminders</option>
                <option value="sms">SMS reminders</option>
                <option value="both">Email & SMS reminders</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setShowTimezoneInfo(!showTimezoneInfo)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showTimezoneInfo ? 'Hide' : 'Show'} timezone information
            </button>

            {showTimezoneInfo && (
              <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                <p>Your local timezone: {new Date().toLocaleString('en-US', { timeZoneName: 'long' }).split(' ').pop()}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Confirm Appointment</h3>

          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Patient ID *</label>
              <input
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
              {errors.patientId && <p className="text-xs text-red-600 mt-1">{errors.patientId}</p>}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Type</p>
                <p className="text-sm font-medium text-gray-900">{selectedType?.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Duration</p>
                <p className="text-sm font-medium text-gray-900">{draft.duration} minutes</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Provider</p>
                <p className="text-sm font-medium text-gray-900">{selectedProvider?.name}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Location</p>
                <p className="text-sm font-medium text-gray-900">
                  {draft.isTelemedicine ? 'Telemedicine' : selectedLocation?.name}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-gray-600 uppercase">Date & Time</p>
                <p className="text-sm font-medium text-gray-900">{draft.scheduledAt}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-gray-600 uppercase">Reason for Visit</p>
                <p className="text-sm text-gray-900">{draft.reasonForVisit}</p>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={joinWaitlist}
              onChange={(e) => setJoinWaitlist(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">
              Join waitlist if preferred slot unavailable
            </span>
          </label>
        </div>
      )}

      {/* Form actions */}
      <div className="flex justify-between border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={step === 'type' ? onCancel : handlePrevStep}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {step === 'type' ? 'Cancel' : 'Back'}
        </button>

        <div className="flex gap-3">
          {step !== 'confirm' && (
            <button
              type="button"
              onClick={handleNextStep}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Next
            </button>
          )}

          {step === 'confirm' && (
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Scheduling...' : 'Confirm Appointment'}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
