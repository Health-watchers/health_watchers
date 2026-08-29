import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CarePlan, HealthWorkflowsService } from '../services/health-workflows.service';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  section: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#333' },
  input: { borderColor: '#ddd', borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  button: { backgroundColor: '#007AFF', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  card: { borderBottomColor: '#eee', borderBottomWidth: 1, paddingVertical: 12 },
  meta: { color: '#666', fontSize: 12, marginTop: 4 },
  progressTrack: { backgroundColor: '#eee', borderRadius: 8, height: 8, marginTop: 8 },
  progressFill: { backgroundColor: '#34C759', borderRadius: 8, height: 8 },
});

export function CarePlansScreen() {
  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [intervention, setIntervention] = useState('');
  const [assignee, setAssignee] = useState('');

  useEffect(() => {
    HealthWorkflowsService.listCarePlans().then(setPlans);
  }, []);

  const createPlan = async () => {
    if (!title.trim() || !goal.trim()) {
      Alert.alert('Missing details', 'Plan title and goal are required');
      return;
    }

    const plan: CarePlan = {
      id: Date.now().toString(),
      title: title.trim(),
      goal: goal.trim(),
      intervention: intervention.trim() || 'Monitor progress during follow-up visits',
      assignee: assignee.trim() || 'Care team',
      progress: 0,
      history: [`Created ${new Date().toLocaleString()}`],
    };

    const saved = await HealthWorkflowsService.saveCarePlan(plan);
    setPlans((current) => [saved, ...current]);
    setTitle('');
    setGoal('');
    setIntervention('');
    setAssignee('');
    Alert.alert('Care plan saved', 'Assigned team members can now track progress.');
  };

  const advanceProgress = (planId: string) => {
    setPlans((current) =>
      current.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              progress: Math.min(plan.progress + 25, 100),
              history: [`Progress updated ${new Date().toLocaleString()}`, ...plan.history],
            }
          : plan
      )
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.title}>Create Care Plan</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Title" />
        <TextInput style={styles.input} value={goal} onChangeText={setGoal} placeholder="Goal" />
        <TextInput
          style={styles.input}
          value={intervention}
          onChangeText={setIntervention}
          placeholder="Intervention"
        />
        <TextInput
          style={styles.input}
          value={assignee}
          onChangeText={setAssignee}
          placeholder="Assign task to"
        />
        <TouchableOpacity style={styles.button} onPress={createPlan}>
          <Text style={styles.buttonText}>Save Care Plan</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Goals & Interventions</Text>
        {plans.length === 0 ? (
          <Text style={styles.meta}>No care plans created</Text>
        ) : (
          plans.map((plan) => (
            <View key={plan.id} style={styles.card}>
              <Text>{plan.title}</Text>
              <Text style={styles.meta}>Goal: {plan.goal}</Text>
              <Text style={styles.meta}>Intervention: {plan.intervention}</Text>
              <Text style={styles.meta}>Assigned to: {plan.assignee}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${plan.progress}%` }]} />
              </View>
              <Text style={styles.meta}>Progress: {plan.progress}%</Text>
              <TouchableOpacity style={styles.button} onPress={() => advanceProgress(plan.id)}>
                <Text style={styles.buttonText}>Update Progress</Text>
              </TouchableOpacity>
              <Text style={styles.meta}>History: {plan.history[0]}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
