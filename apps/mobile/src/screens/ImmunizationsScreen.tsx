import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import { HealthWorkflowsService, ImmunizationRecord } from '../services/health-workflows.service';

const DAY_MS = 1000 * 60 * 60 * 24;
const DUE_SOON_DAYS = 7;

export type DueStatus = 'overdue' | 'due-today' | 'due-soon' | 'future' | 'administered';

export interface DueClassification {
  status: DueStatus;
  daysUntilDue: number;
}

/**
 * Classify an immunization record relative to `now`.
 * Pure helper so the due-date logic can be unit tested.
 */
export function classifyDueDate(
  record: Pick<ImmunizationRecord, 'dueDate' | 'administeredAt'>,
  now: Date = new Date()
): DueClassification {
  if (record.administeredAt) {
    return { status: 'administered', daysUntilDue: 0 };
  }

  const due = new Date(record.dueDate).getTime();
  if (Number.isNaN(due)) {
    return { status: 'future', daysUntilDue: Number.POSITIVE_INFINITY };
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(new Date(due).getFullYear(), new Date(due).getMonth(), new Date(due).getDate()).getTime();
  const daysUntilDue = Math.round((startOfDue - startOfToday) / DAY_MS);

  if (daysUntilDue < 0) return { status: 'overdue', daysUntilDue };
  if (daysUntilDue === 0) return { status: 'due-today', daysUntilDue };
  if (daysUntilDue <= DUE_SOON_DAYS) return { status: 'due-soon', daysUntilDue };
  return { status: 'future', daysUntilDue };
}

export function isDueSoonOrOverdue(
  record: Pick<ImmunizationRecord, 'dueDate' | 'administeredAt'>,
  now: Date = new Date()
): boolean {
  const { status } = classifyDueDate(record, now);
  return status === 'overdue' || status === 'due-today' || status === 'due-soon';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  section: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#333' },
  input: { borderColor: '#ddd', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  button: { backgroundColor: '#007AFF', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  card: { borderBottomColor: '#eee', borderBottomWidth: 1, paddingVertical: 12 },
  meta: { color: '#666', fontSize: 12, marginTop: 4 },
  alert: { color: '#D70015', fontSize: 12, marginTop: 4 },
  dueCard: { backgroundColor: '#FFF4E5', borderRadius: 8, padding: 16, marginBottom: 16 },
  dueTitle: { fontSize: 16, fontWeight: '600', color: '#8A4B00', marginBottom: 8 },
  dueRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  dueLabel: { color: '#8A4B00', fontSize: 13 },
  timelineRow: { flexDirection: 'row', paddingVertical: 8 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, marginRight: 10 },
  timelineContent: { flex: 1 },
  markButton: {
    marginTop: 8,
    borderColor: '#007AFF',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  markButtonText: { color: '#007AFF', fontSize: 12, fontWeight: '600' },
  exportButton: { backgroundColor: '#34C759', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 16 },
  exportButtonText: { color: '#fff', fontWeight: '600' },
});

const defaultSchedule: ImmunizationRecord[] = [
  { id: 'flu', vaccine: 'Influenza', dueDate: new Date().toISOString() },
  {
    id: 'covid-booster',
    vaccine: 'COVID-19 Booster',
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  },
];

export function ImmunizationsScreen() {
  const [records, setRecords] = useState<ImmunizationRecord[]>(defaultSchedule);
  const [vaccine, setVaccine] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [administeredAt, setAdministeredAt] = useState('');

  useEffect(() => {
    HealthWorkflowsService.listImmunizations().then((data) => {
      if (data.length > 0) setRecords(data);
    });
  }, []);

  const upcoming = useMemo(
    () =>
      records
        .filter((record) => !record.administeredAt)
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [records]
  );

  const dueSoon = useMemo(
    () =>
      records
        .filter((record) => isDueSoonOrOverdue(record))
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [records]
  );

  const timeline = useMemo(
    () =>
      [...records].sort((a, b) => {
        const aTime = new Date(a.administeredAt ?? a.dueDate).getTime();
        const bTime = new Date(b.administeredAt ?? b.dueDate).getTime();
        return aTime - bTime;
      }),
    [records]
  );

  useEffect(() => {
    const scheduleAlerts = async () => {
      try {
        const permission = await Notifications.getPermissionsAsync();
        if (permission.status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          if (requested.status !== 'granted') return;
        }

        for (const record of records) {
          if (record.administeredAt) continue;
          const dueTime = new Date(record.dueDate).getTime();
          if (Number.isNaN(dueTime)) continue;
          const triggerTime = dueTime - DUE_SOON_DAYS * DAY_MS;
          if (triggerTime <= Date.now()) continue;

          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Immunization due soon',
              body: `${record.vaccine} is due on ${new Date(record.dueDate).toLocaleDateString()}.`,
            },
            trigger: { type: 'date', date: new Date(triggerTime) } as Notifications.DateTriggerInput,
          });
        }
      } catch (error) {
        // Notification scheduling is best-effort; ignore failures.
      }
    };

    scheduleAlerts();
  }, [records]);

  const markAdministered = async (record: ImmunizationRecord) => {
    const updated: ImmunizationRecord = {
      ...record,
      administeredAt: new Date().toISOString(),
    };
    const saved = await HealthWorkflowsService.saveImmunization(updated);
    setRecords((current) =>
      current.map((item) => (item.id === record.id ? saved : item))
    );
    Alert.alert('Immunization recorded', `${record.vaccine} marked as administered.`);
  };

  const exportCertificate = async () => {
    try {
      const rows = records
        .map(
          (record) =>
            `<tr><td>${record.vaccine}</td><td>${new Date(record.dueDate).toLocaleDateString()}</td><td>${
              record.administeredAt
                ? new Date(record.administeredAt).toLocaleDateString()
                : 'Pending'
            }</td></tr>`
        )
        .join('');
      const html = `<html><body><h1>Immunization Certificate</h1><table border="1" cellpadding="6"><thead><tr><th>Vaccine</th><th>Due</th><th>Administered</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
      } else {
        Alert.alert('Certificate generated', uri);
      }
    } catch (error) {
      Alert.alert('Export failed', 'Unable to generate the immunization certificate.');
    }
  };

  const saveRecord = async () => {
    if (!vaccine.trim() || Number.isNaN(new Date(dueDate).getTime())) {
      Alert.alert('Invalid vaccine', 'Vaccine name and a valid due date are required');
      return;
    }

    const record: ImmunizationRecord = {
      id: Date.now().toString(),
      vaccine: vaccine.trim(),
      dueDate: new Date(dueDate).toISOString(),
      administeredAt: administeredAt ? new Date(administeredAt).toISOString() : undefined,
    };

    const saved = await HealthWorkflowsService.saveImmunization(record);
    setRecords((current) => [saved, ...current]);
    setVaccine('');
    setDueDate('');
    setAdministeredAt('');
    Alert.alert('Immunization logged', 'Schedule and alerts have been updated.');
  };

  const isDue = (record: ImmunizationRecord) =>
    !record.administeredAt && new Date(record.dueDate).getTime() <= Date.now();

  return (
    <ScrollView style={styles.container}>
      {dueSoon.length > 0 ? (
        <View style={styles.dueCard}>
          <Text style={styles.dueTitle}>Due Soon</Text>
          {dueSoon.map((record) => {
            const { status, daysUntilDue } = classifyDueDate(record);
            const label =
              status === 'overdue'
                ? `Overdue by ${Math.abs(daysUntilDue)} day(s)`
                : status === 'due-today'
                ? 'Due today'
                : `Due in ${daysUntilDue} day(s)`;
            return (
              <View key={record.id} style={styles.dueRow}>
                <Text style={styles.dueLabel}>{record.vaccine}</Text>
                <Text style={styles.dueLabel}>{label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <TouchableOpacity style={styles.exportButton} onPress={exportCertificate}>
        <Text style={styles.exportButtonText}>Export Certificate (PDF)</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.title}>Add Immunization</Text>
        <TextInput
          style={styles.input}
          value={vaccine}
          onChangeText={setVaccine}
          placeholder="Vaccine"
        />
        <TextInput
          style={styles.input}
          value={dueDate}
          onChangeText={setDueDate}
          placeholder="Due date, e.g. 2026-10-01"
        />
        <TextInput
          style={styles.input}
          value={administeredAt}
          onChangeText={setAdministeredAt}
          placeholder="Administered date (optional)"
        />
        <TouchableOpacity style={styles.button} onPress={saveRecord}>
          <Text style={styles.buttonText}>Log Vaccination</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Upcoming Vaccines</Text>
        {upcoming.map((record) => (
          <View key={record.id} style={styles.card}>
            <Text>{record.vaccine}</Text>
            <Text style={styles.meta}>Due: {new Date(record.dueDate).toLocaleDateString()}</Text>
            {isDue(record) ? <Text style={styles.alert}>Alert: vaccine is due</Text> : null}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Timeline</Text>
        {timeline.map((record) => {
          const administered = Boolean(record.administeredAt);
          return (
            <View key={record.id} style={styles.timelineRow}>
              <View
                style={[
                  styles.timelineDot,
                  { backgroundColor: administered ? '#34C759' : '#FF9500' },
                ]}
              />
              <View style={styles.timelineContent}>
                <Text>{record.vaccine}</Text>
                <Text style={styles.meta}>
                  {administered
                    ? `Administered ${new Date(record.administeredAt as string).toLocaleDateString()}`
                    : `Due ${new Date(record.dueDate).toLocaleDateString()}`}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Immunization Record</Text>
        {records.map((record) => (
          <View key={record.id} style={styles.card}>
            <Text>{record.vaccine}</Text>
            <Text style={styles.meta}>Due: {new Date(record.dueDate).toLocaleDateString()}</Text>
            <Text style={styles.meta}>
              Status:{' '}
              {record.administeredAt
                ? `Logged ${new Date(record.administeredAt).toLocaleDateString()}`
                : 'Pending'}
            </Text>
            {!record.administeredAt ? (
              <TouchableOpacity
                style={styles.markButton}
                onPress={() => markAdministered(record)}
              >
                <Text style={styles.markButtonText}>Mark as administered</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
