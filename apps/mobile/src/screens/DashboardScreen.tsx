import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useAppointmentsWithCache } from '../services/offline-cache.service';
import { formatDistanceToNow } from 'date-fns';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  appointmentTime: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  appointmentDoctor: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  appointmentStatus: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export function DashboardScreen() {
  const { data: appointments, isLoading, error } = useAppointmentsWithCache();
  const [upcomingCount, setUpcomingCount] = useState(0);

  useEffect(() => {
    if (appointments) {
      const upcoming = appointments.filter((apt: any) => new Date(apt.scheduledAt) > new Date());
      setUpcomingCount(upcoming.length);
    }
  }, [appointments]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
        {appointments && appointments.length > 0 ? (
          appointments
            .filter((apt: any) => new Date(apt.scheduledAt) > new Date())
            .slice(0, 3)
            .map((apt: any) => (
              <View key={apt._id} style={styles.appointmentCard}>
                <Text style={styles.appointmentTime}>
                  {new Date(apt.scheduledAt).toLocaleDateString()} at{' '}
                  {new Date(apt.scheduledAt).toLocaleTimeString()}
                </Text>
                <Text style={styles.appointmentDoctor}>{apt.doctorName}</Text>
                <Text style={styles.appointmentStatus}>{apt.status}</Text>
              </View>
            ))
        ) : (
          <Text style={styles.appointmentStatus}>No upcoming appointments</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Encounters</Text>
        <Text style={styles.appointmentStatus}>{appointments?.length || 0} total appointments</Text>
      </View>
    </ScrollView>
  );
}
