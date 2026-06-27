'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const ALL_SCOPES = [
  'patients:read',
  'patients:write',
  'encounters:read',
  'encounters:write',
  'payments:read',
  'payments:write',
  'lab-results:write',
] as const;

type Scope = (typeof ALL_SCOPES)[number];

interface ApiKey {
  _id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

interface NewKeyResult {
  id: string;
  name: string;
  key: string;
  prefix: string;
  scopes: Scope[];
}

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newKeyResult, setNewKeyResult] = useState<NewKeyResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Scope[]>([]);
  const [expiresAt, setExpiresAt] = useState('');

  const getToken = () =>
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') || '' : '';

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/api-keys`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (json.status === 'success') setKeys(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const toggleScope = (scope: Scope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedScopes.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: name.trim(),
          scopes: selectedScopes,
          expiresAt: expiresAt || undefined,
        }),
      });
      const json = await res.json();
      if (json.status === 'success') {
        setNewKeyResult(json.data);
        setShowForm(false);
        setName('');
        setSelectedScopes([]);
        setExpiresAt('');
        fetchKeys();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    await fetch(`${API_BASE}/api/v1/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchKeys();
  };

  const copyKey = () => {
    if (!newKeyResult) return;
    navigator.clipboard.writeText(newKeyResult.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8 space-y-6">
      {/* One-time key display */}
      {newKeyResult && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <p className="mb-1 text-sm font-semibold text-yellow-800">
            Save your API key — it will only be shown once.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <code className="flex-1 rounded bg-yellow-100 px-3 py-2 font-mono text-xs break-all text-yellow-900">
              {newKeyResult.key}
            </code>
            <Button size="sm" variant="secondary" onClick={copyKey}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => setNewKeyResult(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>API Keys</CardTitle>
            <Button
              size="sm"
              onClick={() => {
                setShowForm((v) => !v);
                setNewKeyResult(null);
              }}
            >
              {showForm ? 'Cancel' : '+ New API Key'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Create form */}
          {showForm && (
            <form
              onSubmit={handleCreate}
              className="border-secondary-200 mb-6 space-y-4 rounded-lg border p-4"
            >
              <div>
                <label className="text-secondary-700 mb-1 block text-sm font-medium">Name</label>
                <input
                  className="border-secondary-300 focus:ring-primary-500 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                  placeholder="e.g. Lab System Integration"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-secondary-700 mb-2 block text-sm font-medium">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_SCOPES.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selectedScopes.includes(scope)
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'text-secondary-700 border-secondary-300 hover:border-primary-400 bg-white'
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
                {selectedScopes.length === 0 && (
                  <p className="text-error-600 mt-1 text-xs">Select at least one scope</p>
                )}
              </div>

              <div>
                <label className="text-secondary-700 mb-1 block text-sm font-medium">
                  Expiry date <span className="text-secondary-400">(optional)</span>
                </label>
                <input
                  type="date"
                  className="border-secondary-300 focus:ring-primary-500 rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                disabled={creating || !name.trim() || selectedScopes.length === 0}
              >
                {creating ? 'Generating…' : 'Generate API Key'}
              </Button>
            </form>
          )}

          {/* Keys table */}
          {loading ? (
            <p className="text-secondary-500 text-sm">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="text-secondary-500 text-sm">No API keys yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-secondary-200 text-secondary-500 border-b text-left text-xs tracking-wide uppercase">
                    <th className="pr-4 pb-2">Name</th>
                    <th className="pr-4 pb-2">Prefix</th>
                    <th className="pr-4 pb-2">Scopes</th>
                    <th className="pr-4 pb-2">Last Used</th>
                    <th className="pr-4 pb-2">Expires</th>
                    <th className="pr-4 pb-2">Status</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-secondary-100 divide-y">
                  {keys.map((k) => (
                    <tr key={k._id} className="py-2">
                      <td className="text-secondary-900 py-3 pr-4 font-medium">{k.name}</td>
                      <td className="text-secondary-600 py-3 pr-4 font-mono">hw_{k.prefix}…</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <span
                              key={s}
                              className="bg-primary-50 text-primary-700 rounded-full px-2 py-0.5 text-xs"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-secondary-500 py-3 pr-4">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="text-secondary-500 py-3 pr-4">
                        {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            k.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {k.isActive ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="py-3">
                        {k.isActive && (
                          <Button size="sm" variant="danger" onClick={() => handleRevoke(k._id)}>
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
