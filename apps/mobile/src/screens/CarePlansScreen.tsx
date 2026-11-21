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
import * as Notifications from 'expo-notifications';
import { CarePlan, HealthWorkflowsService } from '../services/health-workflows.service';

export type TaskFrequency = 'daily' | 'weekly';

export interface CarePlanTask {
  id: string;
  label: string;
  frequency: TaskFrequency;
  completed: boolean;
}

export interface TaskCompletionRecord {
  taskId: string;
  completedAt: string;
}

export interface CarePlanProgress {
  completed: number;
  total: number;
  percent: number;
}

/**
 * Computes progress for a care plan goal from its tasks.
 * Returns a percentage between 0 and 100 (0 when there are no tasks).
 */
export function calculateProgress(tasks: CarePlanTask[]): CarePlanProgress {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percent };
}

/**
 * Computes the current streak of consecutive days (ending today or yesterday)
 * on which every task was completed. `records` holds completion timestamps.
 */
export function calculateStreak(
  records: TaskCompletionRecord[],
  totalTasks: number,
  now: Date = new Date()
): number {
  if (totalTasks <= 0 || records.length === 0) {
    return 0;
  }

  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

  const completionsByDay = new Map<string, number>();
  records.forEach((record) => {
    const date = new Date(record.completedAt);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const key = dayKey(date);
    completionsByDay.set(key, (completionsByDay.get(key) ?? 0) + 1);
  });

  const isCompleteDay = (date: Date) =>
    (completionsByDay.get(dayKey(date)) ?? 0) >= totalTasks;

  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!isCompleteDay(cursor)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (isCompleteDay(cursor)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const REMINDER_IDENTIFIER = 'care-plan-daily-reminder';

async function scheduleDailyReminder(outstandingCount: number): Promise<void> {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    let status = permissions.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') {
      return;
    }

    await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER).catch(() => undefined);

    if (outstandingCount <= 0) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIER,
      content: {
        title: 'Care plan reminder',
        body: `You have ${outstandingCount} outstanding task${outstandingCount === 1 ? '' : 's'} today.`,
      },
      trigger: { hour: 9, minute: 0, repeats: true },
    });
  } catch {
    // Notifications are best-effort; ignore failures on unsupported platforms.
  }
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
  progressTrack: { backgroundColor: '#eee', borderRadius: 8, height: 8, marginTop: 8 },
  progressFill: { backgroundColor: '#34C759', borderRadius: 8, height: 8 },
  taskRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: { backgroundColor: '#007AFF' },
  checkboxMark: { color: '#fff', fontWeight: '700', fontSize: 12 },
  taskLabel: { flex: 1, color: '#333' },
  taskLabelDone: { color: '#999', textDecorationLine: 'line-through' },
  streak: { color: '#FF9500', fontWeight: '600', marginTop: 8 },
});

export function CarePlansScreen() {
  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [tasksByPlan, setTasksByPlan] = useState<Record<string, CarePlanTask[]>>({});
  const [recordsByPlan, setRecordsByPlan] = useState<Record<string, TaskCompletionRecord[]>>({});
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [intervention, setIntervention] = useState('');
  const [assignee, setAssignee] = useState('');

  useEffect(() => {
    HealthWorkflowsService.listCarePlans().then(setPlans);
  }, []);

  const outstandingTaskCount = Object.values(tasksByPlan)
    .flat()
    .filter((task) => !task.completed).length;

  useEffect(() => {
    scheduleDailyReminder(outstandingTaskCount);
  }, [outstandingTaskCount]);

  const toggleTask = async (planId: string, taskId: string) => {
    const planTasks = tasksByPlan[planId] ?? [];
    const target = planTasks.find((task) => task.id === taskId);
    if (!target) {
      return;
    }
    const nextCompleted = !target.completed;

    // Optimistic UI update
    setTasksByPlan((current) => ({
      ...current,
      [planId]: (current[planId] ?? []).map((task) =>
        task.id === taskId ? { ...task, completed: nextCompleted } : task
      ),
    }));
    setRecordsByPlan((current) => {
      const existing = current[planId] ?? [];
      if (nextCompleted) {
        return {
          ...current,
          [planId]: [...existing, { taskId, completedAt: new Date().toISOString() }],
        };
      }
      return {
        ...current,
        [planId]: existing.filter((record) => record.taskId !== taskId),
      };
    });

    try {
      await HealthWorkflowsService.updateTaskCompletion(planId, taskId, nextCompleted);
    } catch {
      // Revert on failure
      setTasksByPlan((current) => ({
        ...current,
        [planId]: (current[planId] ?? []).map((task) =>
          task.id === taskId ? { ...task, completed: !nextCompleted } : task
        ),
      }));
      setRecordsByPlan((current) => {
        const existing = current[planId] ?? [];
        if (nextCompleted) {
          return {
            ...current,
            [planId]: existing.filter((record) => record.taskId !== taskId),
          };
        }
        return {
          ...current,
          [planId]: [...existing, { taskId, completedAt: new Date().toISOString() }],
        };
      });
      Alert.alert('Sync failed', 'Could not save task completion. Please try again.');
    }
  };

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
    setTasksByPlan((current) => ({
      ...current,
      [saved.id]: [
        { id: `${saved.id}-daily`, label: 'Complete daily goal task', frequency: 'daily', completed: false },
        { id: `${saved.id}-weekly`, label: 'Complete weekly goal task', frequency: 'weekly', completed: false },
      ],
    }));
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
          plans.map((plan) => {
            const planTasks = tasksByPlan[plan.id] ?? [];
            const progress = calculateProgress(planTasks);
            const streak = calculateStreak(recordsByPlan[plan.id] ?? [], planTasks.length);
            return (
              <View key={plan.id} style={styles.card}>
                <Text>{plan.title}</Text>
                <Text style={styles.meta}>Goal: {plan.goal}</Text>
                <Text style={styles.meta}>Intervention: {plan.intervention}</Text>
                <Text style={styles.meta}>Assigned to: {plan.assignee}</Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
                </View>
                <Text style={styles.meta}>
                  Goal progress: {progress.completed}/{progress.total} tasks ({progress.percent}%)
                </Text>
                {planTasks.map((task) => (
                  <TouchableOpacity
                    key={task.id}
                    style={styles.taskRow}
                    onPress={() => toggleTask(plan.id, task.id)}
                  >
                    <View style={[styles.checkbox, task.completed && styles.checkboxChecked]}>
                      {task.completed ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <Text style={[styles.taskLabel, task.completed && styles.taskLabelDone]}>
                      {task.label} ({task.frequency})
                    </Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.streak}>🔥 Streak: {streak} day{streak === 1 ? '' : 's'}</Text>
                <TouchableOpacity style={styles.button} onPress={() => advanceProgress(plan.id)}>
                  <Text style={styles.buttonText}>Update Progress</Text>
                </TouchableOpacity>
                <Text style={styles.meta}>History: {plan.history[0]}</Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
