'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorMessage, Spinner } from '@/components/ui';
import { API_V1 } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CarePlanGoal {
  description: string;
  targetValue?: string;
  targetDate?: string;
  status: 'active' | 'achieved' | 'abandoned';
}

interface CarePlanIntervention {
  type: 'medication' | 'lifestyle' | 'monitoring' | 'referral';
  description: string;
  frequency?: string;
}

interface MonitoringItem {
  parameter: string;
  frequency: string;
  targetRange?: string;
}

interface CarePlan {
  _id: string;
  condition: string;
  icdCode?: string;
  goals: CarePlanGoal[];
  interventions: CarePlanIntervention[];
  monitoringSchedule: MonitoringItem[];
  reviewDate: string;
  reviewHistory: { reviewedAt: string; notes?: string; nextReviewDate?: string }[];
  status: 'active' | 'completed' | 'suspended';
  aiGenerated?: boolean;
  createdAt: string;
}

interface CarePlanTabProps {
  patientId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const WRITE_ROLES = new Set(['DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN']);

function statusVariant(s: string) {
  if (s === 'active') return 'success';
  if (s === 'completed') return 'primary';
  if (s === 'suspended') return 'warning';
  return 'default';
}

function goalVariant(s: string) {
  if (s === 'achieved') return 'success';
  if (s === 'abandoned') return 'danger';
  return 'default';
}

const INTERVENTION_ICONS: Record<string, string> = {
  medication: '💊',
  lifestyle: '🏃',
  monitoring: '📊',
  referral: '🔗',
};

// ── Blank form state ──────────────────────────────────────────────────────────

function blankForm() {
  return {
    condition: '',
    icdCode: '',
    reviewDate: '',
    goals: [{ description: '', targetValue: '', targetDate: '' }],
    interventions: [{ type: 'lifestyle' as const, description: '', frequency: '' }],
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export function CarePlanTab({ patientId }: CarePlanTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = user && WRITE_ROLES.has(user.role);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [updatingGoal, setUpdatingGoal] = useState<string | null>(null);

  const { data: plans = [], isLoading, error } = useQuery<CarePlan[]>({
    queryKey: ['care-plans', patientId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/care-plans?patientId=${patientId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load care plans');
      return (await res.json()).data ?? [];
    },
  });

  // ── Create plan ─────────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        patientId,
        condition: form.condition,
        icdCode: form.icdCode || undefined,
        reviewDate: new Date(form.reviewDate).toISOString(),
        goals: form.goals
          .filter((g) => g.description.trim())
          .map((g) => ({
            description: g.description,
            targetValue: g.targetValue || undefined,
            targetDate: g.targetDate ? new Date(g.targetDate).toISOString() : undefined,
            status: 'active' as const,
          })),
        interventions: form.interventions
          .filter((i) => i.description.trim())
          .map((i) => ({
            type: i.type,
            description: i.description,
            frequency: i.frequency || undefined,
          })),
      };

      const res = await fetch(`${API_V1}/care-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? `Error ${res.status}`);

      setShowForm(false);
      setForm(blankForm());
      queryClient.invalidateQueries({ queryKey: ['care-plans', patientId] });
    } catch (err: any) {
      setFormError(err.message ?? 'Failed to create care plan');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Update goal status ──────────────────────────────────────────────────────

  const handleGoalStatus = async (plan: CarePlan, goalIdx: number, newStatus: CarePlanGoal['status']) => {
    const key = `${plan._id}-${goalIdx}`;
    setUpdatingGoal(key);
    try {
      const updatedGoals = plan.goals.map((g, i) =>
        i === goalIdx ? { ...g, status: newStatus } : g
      );
      const res = await fetch(`${API_V1}/care-plans/${plan._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ goals: updatedGoals }),
      });
      if (!res.ok) throw new Error('Failed to update goal');
      queryClient.invalidateQueries({ queryKey: ['care-plans', patientId] });
    } finally {
      setUpdatingGoal(null);
    }
  };

  // ── Update plan status ──────────────────────────────────────────────────────

  const handlePlanStatus = async (planId: string, newStatus: CarePlan['status']) => {
    const res = await fetch(`${API_V1}/care-plans/${planId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) queryClient.invalidateQueries({ queryKey: ['care-plans', patientId] });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorMessage
        message={error instanceof Error ? error.message : 'Failed to load care plans'}
        onRetry={() => queryClient.invalidateQueries({ queryKey: ['care-plans', patientId] })}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      {canWrite && !showForm && (
        <div className="flex justify-end">
          <Button size="sm" variant="primary" onClick={() => setShowForm(true)}>
            + New Care Plan
          </Button>
        </div>
      )}

      {/* Creation form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-5"
        >
          <h3 className="font-semibold text-neutral-900">New Care Plan</h3>

          {/* Condition + ICD + Review date */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-600 mb-1">Condition *</label>
              <input
                required
                value={form.condition}
                onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
                placeholder="e.g. Type 2 Diabetes"
                className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">ICD Code</label>
              <input
                value={form.icdCode}
                onChange={(e) => setForm((f) => ({ ...f, icdCode: e.target.value }))}
                placeholder="e.g. E11.9"
                className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">Review Date *</label>
              <input
                required
                type="date"
                value={form.reviewDate}
                onChange={(e) => setForm((f) => ({ ...f, reviewDate: e.target.value }))}
                className="block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* Goals */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-neutral-600">Goals</label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, goals: [...f.goals, { description: '', targetValue: '', targetDate: '' }] }))}
                className="text-xs text-primary-600 hover:underline"
              >
                + Add goal
              </button>
            </div>
            <div className="space-y-2">
              {form.goals.map((g, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <input
                    value={g.description}
                    onChange={(e) => setForm((f) => {
                      const goals = [...f.goals];
                      goals[i] = { ...goals[i], description: e.target.value };
                      return { ...f, goals };
                    })}
                    placeholder="Goal description"
                    className="col-span-5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <input
                    value={g.targetValue}
                    onChange={(e) => setForm((f) => {
                      const goals = [...f.goals];
                      goals[i] = { ...goals[i], targetValue: e.target.value };
                      return { ...f, goals };
                    })}
                    placeholder="Target value"
                    className="col-span-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <input
                    type="date"
                    value={g.targetDate}
                    onChange={(e) => setForm((f) => {
                      const goals = [...f.goals];
                      goals[i] = { ...goals[i], targetDate: e.target.value };
                      return { ...f, goals };
                    })}
                    className="col-span-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, goals: f.goals.filter((_, j) => j !== i) }))}
                    className="col-span-1 text-neutral-400 hover:text-danger-500 text-lg leading-none pt-0.5"
                    aria-label="Remove goal"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Interventions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-neutral-600">Interventions</label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, interventions: [...f.interventions, { type: 'lifestyle', description: '', frequency: '' }] }))}
                className="text-xs text-primary-600 hover:underline"
              >
                + Add intervention
              </button>
            </div>
            <div className="space-y-2">
              {form.interventions.map((iv, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <select
                    value={iv.type}
                    onChange={(e) => setForm((f) => {
                      const interventions = [...f.interventions];
                      interventions[i] = { ...interventions[i], type: e.target.value as any };
                      return { ...f, interventions };
                    })}
                    className="col-span-3 rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="medication">Medication</option>
                    <option value="lifestyle">Lifestyle</option>
                    <option value="monitoring">Monitoring</option>
                    <option value="referral">Referral</option>
                  </select>
                  <input
                    value={iv.description}
                    onChange={(e) => setForm((f) => {
                      const interventions = [...f.interventions];
                      interventions[i] = { ...interventions[i], description: e.target.value };
                      return { ...f, interventions };
                    })}
                    placeholder="Description"
                    className="col-span-5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <input
                    value={iv.frequency}
                    onChange={(e) => setForm((f) => {
                      const interventions = [...f.interventions];
                      interventions[i] = { ...interventions[i], frequency: e.target.value };
                      return { ...f, interventions };
                    })}
                    placeholder="Frequency"
                    className="col-span-3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, interventions: f.interventions.filter((_, j) => j !== i) }))}
                    className="col-span-1 text-neutral-400 hover:text-danger-500 text-lg leading-none pt-0.5"
                    aria-label="Remove intervention"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {formError && <p className="text-sm text-danger-600">{formError}</p>}

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => { setShowForm(false); setForm(blankForm()); setFormError(null); }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create Plan'}
            </Button>
          </div>
        </form>
      )}

      {/* Plan list */}
      {plans.length === 0 && !showForm ? (
        <EmptyState
          title="No care plans"
          description={canWrite ? 'Create a care plan to start tracking goals and interventions.' : 'No care plans have been created for this patient.'}
          icon="📋"
        />
      ) : (
        <ol className="space-y-3" aria-label="Care plans">
          {plans.map((plan) => {
            const isOpen = expanded === plan._id;
            const activeGoals   = plan.goals.filter((g) => g.status === 'active').length;
            const achievedGoals = plan.goals.filter((g) => g.status === 'achieved').length;
            const totalGoals    = plan.goals.length;

            return (
              <li key={plan._id} className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
                {/* Plan header */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : plan._id)}
                  className="w-full flex items-start justify-between gap-3 p-4 text-left hover:bg-neutral-50 transition-colors"
                  aria-expanded={isOpen}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-neutral-900">{plan.condition}</p>
                      {plan.icdCode && (
                        <span className="font-mono text-xs text-neutral-500">{plan.icdCode}</span>
                      )}
                      {plan.aiGenerated && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">AI</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-neutral-500">
                      {totalGoals > 0 && (
                        <span>{achievedGoals}/{totalGoals} goals achieved</span>
                      )}
                      <span>Review: {new Date(plan.reviewDate).toLocaleDateString()}</span>
                      <span>Created: {new Date(plan.createdAt).toLocaleDateString()}</span>
                    </div>

                    {/* Goal progress bar */}
                    {totalGoals > 0 && (
                      <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-neutral-100">
                        <div
                          className="h-1.5 rounded-full bg-success-500 transition-all"
                          style={{ width: `${Math.round((achievedGoals / totalGoals) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={statusVariant(plan.status)}>{plan.status}</Badge>
                    <span className="text-neutral-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-neutral-100 px-4 pb-4 pt-3 space-y-4">

                    {/* Goals */}
                    {plan.goals.length > 0 && (
                      <section aria-label="Goals">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Goals</h4>
                        <ul className="space-y-2">
                          {plan.goals.map((goal, gi) => {
                            const gKey = `${plan._id}-${gi}`;
                            return (
                              <li key={gi} className="flex items-start justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-neutral-800">{goal.description}</p>
                                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-neutral-500">
                                    {goal.targetValue && <span>Target: {goal.targetValue}</span>}
                                    {goal.targetDate && <span>By: {new Date(goal.targetDate).toLocaleDateString()}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <Badge variant={goalVariant(goal.status)}>{goal.status}</Badge>
                                  {canWrite && goal.status === 'active' && (
                                    <>
                                      <button
                                        onClick={() => handleGoalStatus(plan, gi, 'achieved')}
                                        disabled={updatingGoal === gKey}
                                        className="rounded bg-success-100 px-2 py-0.5 text-xs text-success-700 hover:bg-success-200 disabled:opacity-50"
                                      >
                                        Achieved
                                      </button>
                                      <button
                                        onClick={() => handleGoalStatus(plan, gi, 'abandoned')}
                                        disabled={updatingGoal === gKey}
                                        className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-200 disabled:opacity-50"
                                      >
                                        Abandon
                                      </button>
                                    </>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    )}

                    {/* Interventions */}
                    {plan.interventions.length > 0 && (
                      <section aria-label="Interventions">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Interventions</h4>
                        <ul className="space-y-1.5">
                          {plan.interventions.map((iv, ii) => (
                            <li key={ii} className="flex items-start gap-2 text-sm text-neutral-700">
                              <span>{INTERVENTION_ICONS[iv.type] ?? '•'}</span>
                              <span>
                                <span className="capitalize font-medium">{iv.type}</span>
                                {' — '}{iv.description}
                                {iv.frequency && <span className="text-neutral-500"> · {iv.frequency}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {/* Monitoring */}
                    {plan.monitoringSchedule.length > 0 && (
                      <section aria-label="Monitoring schedule">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Monitoring</h4>
                        <ul className="space-y-1.5">
                          {plan.monitoringSchedule.map((m, mi) => (
                            <li key={mi} className="text-sm text-neutral-700">
                              <span className="font-medium">{m.parameter}</span>
                              {' — '}{m.frequency}
                              {m.targetRange && <span className="text-neutral-500"> (target: {m.targetRange})</span>}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {/* Review history */}
                    {plan.reviewHistory.length > 0 && (
                      <section aria-label="Review history">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                          Review History ({plan.reviewHistory.length})
                        </h4>
                        <ul className="space-y-1">
                          {plan.reviewHistory.map((r, ri) => (
                            <li key={ri} className="text-xs text-neutral-500">
                              {new Date(r.reviewedAt).toLocaleDateString()}
                              {r.notes && ` — ${r.notes}`}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {/* Plan actions */}
                    {canWrite && (
                      <div className="flex gap-2 pt-1">
                        {plan.status === 'active' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePlanStatus(plan._id, 'completed')}
                            >
                              Mark Completed
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePlanStatus(plan._id, 'suspended')}
                            >
                              Suspend
                            </Button>
                          </>
                        )}
                        {plan.status === 'suspended' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePlanStatus(plan._id, 'active')}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
