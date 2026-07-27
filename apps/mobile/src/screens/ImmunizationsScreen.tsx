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
import { HealthWorkflowsService, ImmunizationRecord } from '../services/health-workflows.service';

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
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
