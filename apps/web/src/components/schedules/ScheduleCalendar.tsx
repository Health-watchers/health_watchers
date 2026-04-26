'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';

interface Schedule {
  _id: string;
  userId: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  role: 'DOCTOR' | 'NURSE' | 'ASSISTANT';
  isOnCall: boolean;
  status: 'scheduled' | 'confirmed' | 'absent' | 'cancelled';
}

interface ScheduleCalendarProps {
  startDate: Date;
  onScheduleSelect?: (schedule: Schedule) => void;
}

const roleColors = {
  DOCTOR: 'bg-blue-100 border-blue-300 text-blue-900',
  NURSE: 'bg-green-100 border-green-300 text-green-900',
  ASSISTANT: 'bg-purple-100 border-purple-300 text-purple-900',
};

export function ScheduleCalendar({ startDate, onScheduleSelect }: ScheduleCalendarProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(startDate);

  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const weekStart = new Date(currentWeek);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const params = new URLSearchParams({
          startDate: weekStart.toISOString(),
          endDate: weekEnd.toISOString(),
          limit: '100',
        });

        const response = await fetch(`/api/v1/schedules?${params}`);
        if (!response.ok) throw new Error('Failed to fetch schedules');
        const data = await response.json();
        setSchedules(data.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchSchedules();
  }, [currentWeek]);

  const getDaysInWeek = () => {
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start);
      date.setDate(date.getDate() + i);
      return date;
    });
  };

  const getSchedulesForDay = (date: Date) => {
    return schedules.filter((s) => {
      const scheduleDate = new Date(s.date);
      return (
        scheduleDate.toDateString() === date.toDateString() && s.status !== 'cancelled'
      );
    });
  };

  const days = getDaysInWeek();

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading schedules...</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Weekly Schedule</h2>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              const prev = new Date(currentWeek);
              prev.setDate(prev.getDate() - 7);
              setCurrentWeek(prev);
            }}
            variant="secondary"
            size="sm"
          >
            ← Previous
          </Button>
          <Button
            onClick={() => {
              const next = new Date(currentWeek);
              next.setDate(next.getDate() + 7);
              setCurrentWeek(next);
            }}
            variant="secondary"
            size="sm"
          >
            Next →
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const daySchedules = getSchedulesForDay(day);
          return (
            <div
              key={day.toISOString()}
              className="rounded-lg border border-neutral-200 bg-white p-3"
            >
              <p className="text-xs font-semibold text-neutral-600">
                {day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
              <div className="mt-2 space-y-1">
                {daySchedules.map((schedule) => (
                  <div
                    key={schedule._id}
                    onClick={() => onScheduleSelect?.(schedule)}
                    className={`cursor-pointer rounded border p-1 text-xs ${roleColors[schedule.role]}`}
                  >
                    <p className="font-semibold">{schedule.role}</p>
                    <p>{schedule.shiftStart} - {schedule.shiftEnd}</p>
                    {schedule.isOnCall && <p className="text-xs">On Call</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
