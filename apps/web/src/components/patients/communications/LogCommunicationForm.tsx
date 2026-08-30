'use client';

import { useState } from 'react';
import { useLogCommunication, type LogCommunicationInput } from '@/lib/queries/useCommunications';

interface Props {
  patientId: string;
  onClose: () => void;
}

const CHANNELS = ['sms', 'whatsapp', 'email', 'phone_call', 'in_person'] as const;
const DIRECTIONS = ['outbound', 'inbound'] as const;
const STATUSES = ['sent', 'delivered', 'failed', 'read'] as const;

export function LogCommunicationForm({ patientId, onClose }: Props) {
  const { mutate, isPending, error } = useLogCommunication(patientId);

  const [form, setForm] = useState<LogCommunicationInput>({
    channel: 'sms',
    direction: 'outbound',
    content: '',
    status: 'sent',
    sentAt: new Date().toISOString().slice(0, 16),
  });
  const [validationError, setValidationError] = useState('');

  function set<K extends keyof LogCommunicationInput>(key: K, value: LogCommunicationInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setValidationError('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) {
      setValidationError('Content is required');
      return;
    }
    if (!form.sentAt) {
      setValidationError('Sent at date is required');
      return;
    }
    mutate({ ...form, sentAt: new Date(form.sentAt).toISOString() }, { onSuccess: onClose });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Channel</label>
        <select
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.channel}
          onChange={(e) => set('channel', e.target.value as LogCommunicationInput['channel'])}
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Direction</label>
        <select
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.direction}
          onChange={(e) => set('direction', e.target.value as LogCommunicationInput['direction'])}
        >
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
        <select
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.status}
          onChange={(e) => set('status', e.target.value as LogCommunicationInput['status'])}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Sent At *</label>
        <input
          type="datetime-local"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.sentAt}
          onChange={(e) => set('sentAt', e.target.value)}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Content *</label>
        <textarea
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          rows={4}
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
          placeholder="Communication content..."
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Related Encounter ID <span className="text-gray-400">(optional)</span>
        </label>
        <input
          type="text"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.relatedEncounterId ?? ''}
          onChange={(e) => set('relatedEncounterId', e.target.value || undefined)}
          placeholder="ObjectId..."
        />
      </div>

      {(validationError || error) && (
        <p className="text-sm text-red-600">{validationError || error?.message}</p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Log Communication'}
        </button>
      </div>
    </form>
  );
}
