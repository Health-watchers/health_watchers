'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CDSRulesList } from '@/components/cds/CDSRulesList';
import { CDSRuleForm } from '@/components/cds/CDSRuleForm';
import { CDSRuleTester } from '@/components/cds/CDSRuleTester';
import type { CDSRule } from '@/types/cds';

type View = 'list' | 'create' | 'edit' | 'test';

interface EditingRule extends CDSRule {
  _id?: string;
}

async function fetchRules(): Promise<CDSRule[]> {
  const res = await fetch('/api/cds/rules');
  if (!res.ok) throw new Error('Failed to load CDS rules');
  const body = await res.json();
  return body.data;
}

async function createRule(rule: Omit<CDSRule, 'createdAt' | 'updatedAt'>): Promise<CDSRule> {
  const res = await fetch('/api/cds/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error('Failed to create rule');
  const body = await res.json();
  return body.data;
}

async function updateRule(ruleId: string, updates: Partial<CDSRule>): Promise<CDSRule> {
  const res = await fetch(`/api/cds/rules/${ruleId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update rule');
  const body = await res.json();
  return body.data;
}

async function deleteRule(ruleId: string): Promise<void> {
  const res = await fetch(`/api/cds/rules/${ruleId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete rule');
}

export default function CDSRulesClient() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('list');
  const [editingRule, setEditingRule] = useState<EditingRule | null>(null);

  const {
    data: rules = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['cds-rules'],
    queryFn: fetchRules,
  });

  const createMutation = useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cds-rules'] });
      setView('list');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ ruleId, updates }: { ruleId: string; updates: Partial<CDSRule> }) =>
      updateRule(ruleId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cds-rules'] });
      setView('list');
      setEditingRule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cds-rules'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-neutral-500">
        Loading CDS rules…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-danger-500 flex items-center justify-center py-16 text-sm">
        Failed to load CDS rules
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">CDS Rules Management</h1>
        {view === 'list' && (
          <button
            onClick={() => {
              setEditingRule(null);
              setView('create');
            }}
            className="bg-primary-600 hover:bg-primary-700 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            Create Rule
          </button>
        )}
      </div>

      {view === 'list' && (
        <CDSRulesList
          rules={rules}
          onEdit={(rule) => {
            setEditingRule(rule);
            setView('edit');
          }}
          onTest={(rule) => {
            setEditingRule(rule);
            setView('test');
          }}
          onDelete={(ruleId) => deleteMutation.mutate(ruleId)}
          isDeleting={deleteMutation.isPending}
        />
      )}

      {view === 'create' && (
        <CDSRuleForm
          onSubmit={(rule) => createMutation.mutate(rule)}
          onCancel={() => setView('list')}
          isLoading={createMutation.isPending}
        />
      )}

      {view === 'edit' && editingRule && (
        <CDSRuleForm
          initialRule={editingRule}
          onSubmit={(updates) =>
            updateMutation.mutate({
              ruleId: editingRule.ruleId,
              updates,
            })
          }
          onCancel={() => {
            setView('list');
            setEditingRule(null);
          }}
          isLoading={updateMutation.isPending}
        />
      )}

      {view === 'test' && editingRule && (
        <CDSRuleTester
          rule={editingRule}
          onBack={() => {
            setView('list');
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
}
