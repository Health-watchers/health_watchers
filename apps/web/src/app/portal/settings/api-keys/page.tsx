'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Toast, PageWrapper, Badge } from '@/components/ui';

interface APIKey {
  _id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsed?: string;
  status: 'active' | 'revoked';
}

export default function APIKeysPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<{ key: string; name: string } | null>(null);
  const [showCopyNotice, setShowCopyNotice] = useState(false);

  useEffect(() => {
    fetchAPIKeys();
  }, []);

  const fetchAPIKeys = async () => {
    try {
      const response = await fetch('/api/v1/settings/api-keys', {
        headers: { Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
      setError('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) {
      setError('Please enter a key name');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/settings/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}`,
        },
        body: JSON.stringify({ name: keyName }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to create API key');
        return;
      }

      const data = await response.json();
      setGeneratedKey(data.data);
      setKeyName('');
    } catch (err) {
      setError('An error occurred while creating API key');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setShowCopyNotice(true);
    setTimeout(() => setShowCopyNotice(false), 2000);
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this key? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/settings/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('portalAccessToken')}` },
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to revoke API key');
        return;
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      fetchAPIKeys();
    } catch (err) {
      setError('An error occurred while revoking API key');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="p-6">Loading API keys...</div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">API Key Management</h1>
          <Button onClick={() => setShowCreateModal(true)}>Generate New Key</Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {success && (
          <Toast type="success" message="API key revoked successfully!" />
        )}

        {showCopyNotice && (
          <Toast type="success" message="Copied to clipboard!" />
        )}

        {/* API Keys List */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Your API Keys</h2>
          {apiKeys.length === 0 ? (
            <p className="text-gray-600">No API keys generated yet. Create one to get started.</p>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div
                  key={key._id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{key.name}</p>
                    <p className="text-xs text-gray-600">
                      {key.prefix}... • Created{' '}
                      {new Date(key.createdAt).toLocaleDateString()}
                    </p>
                    {key.lastUsed && (
                      <p className="text-xs text-gray-500">
                        Last used: {new Date(key.lastUsed).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={key.status === 'active' ? 'default' : 'danger'}>
                      {key.status}
                    </Badge>
                    {key.status === 'active' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRevokeKey(key._id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6">
              <h3 className="mb-4 text-lg font-semibold">Generate New API Key</h3>

              {!generatedKey ? (
                <form onSubmit={handleCreateKey} className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium">Key Name</label>
                    <Input
                      type="text"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder="e.g., Production API Key"
                    />
                    <p className="mt-1 text-xs text-gray-600">
                      Give your key a meaningful name to remember its purpose
                    </p>
                  </div>

                  <div className="mt-6 flex gap-2">
                    <Button type="submit" disabled={saving}>
                      {saving ? 'Creating...' : 'Generate Key'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowCreateModal(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className="text-sm font-medium text-green-800">Key created successfully!</p>
                    <p className="mt-2 text-xs text-green-700">
                      Copy this key now. You won't be able to see it again.
                    </p>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs text-gray-600">API Key for: {generatedKey.name}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 overflow-auto truncate text-xs font-mono">
                        {generatedKey.key}
                      </code>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCopyKey(generatedKey.key)}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      setShowCreateModal(false);
                      setGeneratedKey(null);
                      fetchAPIKeys();
                    }}
                    className="w-full"
                  >
                    Done
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
