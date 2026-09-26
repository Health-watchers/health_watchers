import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, SafeAreaView } from 'react-native';
import type { AppointmentData } from './types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface AppointmentCalendarProps {
  appointments: AppointmentData[];
  onSelectDate?: (date: Date) => void;
  onSelectAppointment?: (appointment: AppointmentData) => void;
}

export function AppointmentCalendar({
  appointments,
  onSelectDate,
  onSelectAppointment,
}: AppointmentCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const appointmentsForDate = (date: Date) => {
    return appointments.filter((apt) => {
      const aptDate = new Date(apt.date);
      return (
        aptDate.getDate() === date.getDate() &&
        aptDate.getMonth() === date.getMonth() &&
        aptDate.getFullYear() === date.getFullYear()
      );
    });
  };

  const renderDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.emptyDay} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const isSelected = date.toDateString() === selectedDate.toDateString();
      const hasAppointments = appointmentsForDate(date).length > 0;

      days.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.day,
            isSelected && styles.selectedDay,
            hasAppointments && styles.dayWithAppointment,
          ]}
          onPress={() => {
            setSelectedDate(date);
            onSelectDate?.(date);
          }}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>{day}</Text>
          {hasAppointments && <View style={styles.appointmentIndicator} />}
        </TouchableOpacity>
      );
    }

    return days;
  };

  const selectedAppointments = appointmentsForDate(selectedDate);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))
          }
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Text style={styles.navButton}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthYear}>
          {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
        </Text>
        <TouchableOpacity
          onPress={() =>
            setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))
          }
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <Text style={styles.navButton}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.daysOfWeek}>
        {DAYS.map((day) => (
          <Text key={day} style={styles.dayOfWeek}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.calendar}>{renderDays()}</View>

      <View style={styles.appointmentsList}>
        <Text style={styles.selectedDateText}>
          {selectedDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </Text>

        {selectedAppointments.length > 0 ? (
          <FlatList
            data={selectedAppointments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.appointmentCard}
                onPress={() => onSelectAppointment?.(item)}
                activeOpacity={0.7}
              >
                <View style={styles.appointmentTime}>
                  <Text style={styles.appointmentTimeText}>{item.time}</Text>
                </View>
                <View style={styles.appointmentInfo}>
                  <Text style={styles.appointmentTitle}>{item.title}</Text>
                  <Text style={styles.appointmentDoctor}>{item.doctorName}</Text>
                  <Text style={styles.appointmentLocation}>{item.location}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    item.status === 'completed' && styles.completedBadge,
                    item.status === 'cancelled' && styles.cancelledBadge,
                  ]}
                >
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </TouchableOpacity>
            )}
            scrollEnabled={false}
          />
        ) : (
          <Text style={styles.noAppointments}>No appointments scheduled</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  monthYear: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  navButton: {
    fontSize: 28,
    color: '#2563eb',
  },
  daysOfWeek: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f3f4f6',
  },
  dayOfWeek: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  calendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyDay: {
    flex: 1,
    height: 50,
  },
  day: {
    flex: 1,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
    borderRadius: 8,
    position: 'relative',
  },
  selectedDay: {
    backgroundColor: '#2563eb',
  },
  dayWithAppointment: {
    backgroundColor: '#dbeafe',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  selectedDayText: {
    color: '#fff',
  },
  appointmentIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2563eb',
  },
  appointmentsList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  selectedDateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
  },
  appointmentTime: {
    marginRight: 12,
  },
  appointmentTimeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  appointmentDoctor: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  appointmentLocation: {
    fontSize: 12,
    color: '#9ca3af',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#fee2e2',
  },
  completedBadge: {
    backgroundColor: '#dcfce7',
  },
  cancelledBadge: {
    backgroundColor: '#fecaca',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#991b1b',
  },
  noAppointments: {
    textAlign: 'center',
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 20,
  },
});
