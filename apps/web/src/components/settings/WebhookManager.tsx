'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent, Modal } from '@/components/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const ALL_EVENTS = [
  'payment.confirmed',
  'payment.failed',
  'appointment.created',
  'appointment.cancelled',
  'patient.created',
  'patient.updated',
  'encounter.created',
  'encounter.updated',
  'lab_result.created',
  'lab_result.updated',
  'referral.created',
  'referral.completed',
  'immunization.recorded',
  'care_plan.created',
  'care_plan.updated',
  'consent.granted',
  'consent.revoked',
  'notification.created',
  'invoice.created',
  'invoice.paid',
] as const;

interface Webhook {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  description?: string;
  retryConfig?: {
    maxRetries: number;
    backoffType: string;
    initialDelayMs: number;
  };
  createdAt: string;
}

interface Delivery {
  id: string;
  event: string;
  status: string;
  attempts: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  responseStatus?: number;
  error?: string;
  createdAt: string;
}

interface EventLog {
  id: string;
  event: string;
  status: string;
  deliveredAt?: string;
  error?: string;
  createdAt: string;
}

interface Stats {
  totalWebhooks: number;
  activeWebhooks: number;
  deliveries: {
    delivered: number;
    pending: number;
    failed: number;
    dead: number;
  };
}

export default function WebhookManager() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [eventLogs, setEventLogs] = useState<EventLog[]>([]);
  const [activeTab, setActiveTab] = useState<'deliveries' | 'events'>('deliveries');
  const [detailLoading, setDetailLoading] = useState(false);

  const getToken = () =>
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') || '' : '';

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const [whRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/webhooks`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
        fetch(`${API_BASE}/api/v1/webhooks/stats/overview`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }),
      ]);
      const whJson = await whRes.json();
      const statsJson = await statsRes.json();
      if (whJson.status === 'success') setWebhooks(whJson.data);
      if (statsJson.status === 'success') setStats(statsJson.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const fetchDeliveries = async (webhookId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/webhooks/${webhookId}/deliveries`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (json.status === 'success') setDeliveries(json.data);
    } finally {
      setDetailLoading(false);
    }
  };

  const fetchEventLogs = async (webhookId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/webhooks/${webhookId}/events`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (json.status === 'success') setEventLogs(json.data.events);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleViewDetails = async (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setActiveTab('deliveries');
    await fetchDeliveries(webhook.id);
  };

  const handleTabChange = async (tab: 'deliveries' | 'events') => {
    setActiveTab(tab);
    if (!selectedWebhook) return;
    if (tab === 'events') {
      await fetchEventLogs(selectedWebhook.id);
    } else {
      await fetchDeliveries(selectedWebhook.id);
    }
  };

  const handleRetry = async (webhookId: string, deliveryId: string) => {
    await fetch(`${API_BASE}/api/v1/webhooks/${webhookId}/deliveries/${deliveryId}/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    await fetchDeliveries(webhookId);
  };

  const handleToggle = async (webhook: Webhook) => {
    await fetch(`${API_BASE}/api/v1/webhooks/${webhook.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ isActive: !webhook.isActive }),
    });
    fetchWebhooks();
  };

  const handleDelete = async (webhook: Webhook) => {
    if (!confirm(`Delete webhook for ${webhook.url}? This cannot be undone.`)) return;
    await fetch(`${API_BASE}/api/v1/webhooks/${webhook.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    setSelectedWebhook(null);
    fetchWebhooks();
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      case 'dead':
        return 'bg-red-200 text-red-800';
      case 'dispatched':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-neutral-100 text-neutral-700';
    }
  };

  return (
    <div className="mt-8 space-y-6">
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card padding="sm">
            <p className="text-xs text-neutral-500">Total Webhooks</p>
            <p className="text-2xl font-bold text-neutral-900">{stats.totalWebhooks}</p>
          </Card>
          <Card padding="sm">
            <p className="text-xs text-neutral-500">Active</p>
            <p className="text-2xl font-bold text-green-600">{stats.activeWebhooks}</p>
          </Card>
          <Card padding="sm">
            <p className="text-xs text-neutral-500">Delivered</p>
            <p className="text-2xl font-bold text-blue-600">{stats.deliveries.delivered}</p>
          </Card>
          <Card padding="sm">
            <p className="text-xs text-neutral-500">Failed / Dead</p>
            <p className="text-2xl font-bold text-red-600">
              {stats.deliveries.failed + stats.deliveries.dead}
            </p>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Webhooks</CardTitle>
            <Button size="sm" onClick={() => setShowCreateForm(true)}>
              + New Webhook
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-neutral-500">Loading...</p>
          ) : webhooks.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No webhooks configured. Create one to receive event notifications.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs tracking-wide uppercase text-neutral-500">
                    <th className="pb-2 pr-4">URL</th>
                    <th className="pb-2 pr-4">Events</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Created</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {webhooks.map((wh) => (
                    <tr key={wh.id} className="py-2">
                      <td className="py-3 pr-4 font-medium text-neutral-900">{wh.url}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {wh.events.slice(0, 3).map((e) => (
                            <span
                              key={e}
                              className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                            >
                              {e}
                            </span>
                          ))}
                          {wh.events.length > 3 && (
                            <span className="text-xs text-neutral-500">
                              +{wh.events.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            wh.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {wh.isActive ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-neutral-500">
                        {new Date(wh.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleViewDetails(wh)}>
                            Details
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggle(wh)}
                          >
                            {wh.isActive ? 'Pause' : 'Enable'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreateForm && (
        <CreateWebhookForm
          onClose={() => setShowCreateForm(false)}
          onCreated={() => {
            setShowCreateForm(false);
            fetchWebhooks();
          }}
          getToken={getToken}
        />
      )}

      {selectedWebhook && (
        <Modal
          open={!!selectedWebhook}
          onClose={() => {
            setSelectedWebhook(null);
            setDeliveries([]);
            setEventLogs([]);
          }}
          title="Webhook Details"
          size="lg"
        >
          <div className="space-y-4">
            <div className="text-sm">
              <p className="text-neutral-500">URL</p>
              <p className="font-mono text-neutral-900">{selectedWebhook.url}</p>
            </div>
            {selectedWebhook.description && (
              <div className="text-sm">
                <p className="text-neutral-500">Description</p>
                <p className="text-neutral-900">{selectedWebhook.description}</p>
              </div>
            )}
            {selectedWebhook.retryConfig && (
              <div className="text-sm">
                <p className="text-neutral-500">Retry Config</p>
                <p className="text-neutral-900">
                  {selectedWebhook.retryConfig.maxRetries} retries,{' '}
                  {selectedWebhook.retryConfig.backoffType} backoff,{' '}
                  {selectedWebhook.retryConfig.initialDelayMs}ms initial delay
                </p>
              </div>
            )}

            <div className="flex gap-2 border-b border-neutral-200">
              <button
                onClick={() => handleTabChange('deliveries')}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'deliveries'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Deliveries
              </button>
              <button
                onClick={() => handleTabChange('events')}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'events'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                Event Log
              </button>
            </div>

            {detailLoading ? (
              <p className="text-sm text-neutral-500">Loading...</p>
            ) : activeTab === 'deliveries' ? (
              deliveries.length === 0 ? (
                <p className="text-sm text-neutral-500">No deliveries yet.</p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {deliveries.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded-md border border-neutral-200 p-3"
                    >
                      <div className="text-sm">
                        <span className="font-medium text-neutral-900">{d.event}</span>
                        <span className="mx-2 text-neutral-300">|</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(d.status)}`}>
                          {d.status}
                        </span>
                        <span className="ml-2 text-xs text-neutral-500">
                          {d.attempts} attempt{d.attempts !== 1 ? 's' : ''}
                        </span>
                        {d.error && (
                          <p className="mt-1 text-xs text-red-600">{d.error}</p>
                        )}
                      </div>
                      {(d.status === 'failed' || d.status === 'dead') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(selectedWebhook.id, d.id)}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : eventLogs.length === 0 ? (
              <p className="text-sm text-neutral-500">No events logged yet.</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {eventLogs.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded-md border border-neutral-200 p-3"
                  >
                    <div className="text-sm">
                      <span className="font-medium text-neutral-900">{e.event}</span>
                      <span className="mx-2 text-neutral-300">|</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(e.status)}`}>
                        {e.status}
                      </span>
                      <span className="ml-2 text-xs text-neutral-500">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                      {e.error && (
                        <p className="mt-1 text-xs text-red-600">{e.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
              <Button
                size="sm"
                variant="danger"
                onClick={() => handleDelete(selectedWebhook)}
              >
                Delete Webhook
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateWebhookForm({
  onClose,
  onCreated,
  getToken,
}: {
  onClose: () => void;
  onCreated: () => void;
  getToken: () => string;
}) {
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [maxRetries, setMaxRetries] = useState(3);
  const [backoffType, setBackoffType] = useState<string>('exponential');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || selectedEvents.length === 0) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          url: url.trim(),
          events: selectedEvents,
          description: description.trim() || undefined,
          retryConfig: {
            maxRetries,
            backoffType,
            initialDelayMs: 1000,
          },
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        onCreated();
      } else {
        setError(json.message || 'Failed to create webhook');
      }
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
      <div
        className="fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg dark:bg-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Create Webhook
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">URL</label>
            <input
              type="url"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              placeholder="https://your-server.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Description <span className="text-neutral-400">(optional)</span>
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              placeholder="e.g. Lab system integration"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700">Events</label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-200 p-2">
              <div className="flex flex-wrap gap-2">
                {ALL_EVENTS.map((event) => (
                  <button
                    key={event}
                    type="button"
                    onClick={() => toggleEvent(event)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selectedEvents.includes(event)
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-neutral-300 bg-white text-neutral-700 hover:border-primary-400'
                    }`}
                  >
                    {event}
                  </button>
                ))}
              </div>
            </div>
            {selectedEvents.length === 0 && (
              <p className="mt-1 text-xs text-red-600">Select at least one event</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Max Retries</label>
              <input
                type="number"
                min={1}
                max={10}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                value={maxRetries}
                onChange={(e) => setMaxRetries(parseInt(e.target.value) || 3)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Backoff Type</label>
              <select
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                value={backoffType}
                onChange={(e) => setBackoffType(e.target.value)}
              >
                <option value="exponential">Exponential</option>
                <option value="linear">Linear</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || selectedEvents.length === 0}>
              {creating ? 'Creating...' : 'Create Webhook'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
