'use client';

import { useState, useMemo } from 'react';

interface TimeSlot {
  time: string;
  available: boolean;
  booked?: boolean;
}

interface SchedulingCalendarProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  timeSlots: TimeSlot[];
  onSlotSelect: (time: string) => void;
  isLoading?: boolean;
}

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function SchedulingCalendar({
  selectedDate,
  onDateChange,
  timeSlots,
  onSlotSelect,
  isLoading,
}: SchedulingCalendarProps) {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const weekDays = getWeekDays(selectedDate);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const renderMonthView = () => {
    const daysInMonth = getDaysInMonth(selectedDate);
    const firstDay = getFirstDayOfMonth(selectedDate);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), i));
    }

    return (
      <div className="grid grid-cols-7 gap-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="py-2 text-center text-xs font-semibold text-gray-600">
            {day}
          </div>
        ))}
        {days.map((day, idx) => (
          <button
            key={idx}
            onClick={() => day && onDateChange(day)}
            disabled={!day}
            className={`rounded-lg p-2 text-sm font-medium transition-colors ${
              day
                ? isSameDay(day, selectedDate)
                  ? 'bg-blue-600 text-white'
                  : day < new Date() && day.toDateString() !== new Date().toDateString()
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                    : 'border border-gray-200 hover:bg-blue-50'
                : 'invisible'
            }`}
          >
            {day?.getDate()}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('week')}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            viewMode === 'week'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          Week
        </button>
        <button
          onClick={() => setViewMode('month')}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            viewMode === 'month'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          Month
        </button>
      </div>

      {/* Calendar header */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => {
            const prev = new Date(selectedDate);
            prev.setDate(prev.getDate() - (viewMode === 'week' ? 7 : 1));
            onDateChange(prev);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          ← Previous
        </button>

        <h3 className="text-lg font-semibold text-gray-900">
          {selectedDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
            ...(viewMode === 'week' && { day: 'numeric' }),
          })}
        </h3>

        <button
          onClick={() => {
            const next = new Date(selectedDate);
            next.setDate(next.getDate() + (viewMode === 'week' ? 7 : 1));
            onDateChange(next);
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Next →
        </button>
      </div>

      {/* Calendar display */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        {viewMode === 'week' ? (
          <div className="space-y-2">
            {weekDays.map((day) => (
              <button
                key={day.toISOString()}
                onClick={() => onDateChange(day)}
                className={`w-full rounded-lg border-2 p-3 text-left transition-colors ${
                  isSameDay(day, selectedDate)
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="font-medium text-gray-900">
                  {day.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {getAvailableSlots(day, timeSlots).length} slots available
                </div>
              </button>
            ))}
          </div>
        ) : (
          renderMonthView()
        )}
      </div>

      {/* Time slots */}
      <div>
        <h4 className="mb-3 text-sm font-semibold text-gray-900">
          Available times on{' '}
          {selectedDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </h4>
        {isLoading ? (
          <div className="py-4 text-center text-gray-500">Loading available times...</div>
        ) : timeSlots.length === 0 ? (
          <div className="py-4 text-center text-gray-500">No available slots on this date</div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {timeSlots.map((slot) => (
              <button
                key={slot.time}
                onClick={() => slot.available && onSlotSelect(slot.time)}
                disabled={!slot.available}
                className={`rounded-lg p-2 text-sm font-medium transition-colors ${
                  slot.available
                    ? slot.booked
                      ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                      : 'border border-blue-300 bg-white text-blue-600 hover:bg-blue-50'
                    : 'cursor-not-allowed bg-gray-100 text-gray-400'
                }`}
              >
                {slot.time}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getAvailableSlots(date: Date, timeSlots: TimeSlot[]): TimeSlot[] {
  return timeSlots.filter((slot) => slot.available && !slot.booked);
}
