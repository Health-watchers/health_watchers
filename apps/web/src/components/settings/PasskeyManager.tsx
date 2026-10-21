'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import {
  Passkey,
  listPasskeys,
  passkeyErrorMessage,
  passkeysSupported,
  registerPasskey,
  removePasskey,
  renamePasskey,
} from '@/lib/passkeys';

const PASSKEYS_KEY = ['passkeys'];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : 'Never';
}

export function PasskeyManager() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Resolved after mount — the server render can't know whether the browser supports WebAuthn
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(passkeysSupported()), []);

  const { data: passkeys = [], isLoading } = useQuery({
    queryKey: PASSKEYS_KEY,
    queryFn: listPasskeys,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: PASSKEYS_KEY });
  const onError = (err: unknown) => setError(passkeyErrorMessage(err));

  const addMutation = useMutation({
    mutationFn: () => registerPasskey(newName.trim()),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      setNewName('');
      if (result.backupCodes) setBackupCodes(result.backupCodes);
      refresh();
    },
    onError,
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renamePasskey(id, name),
    onMutate: () => setError(null),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removePasskey(id),
    onMutate: () => setError(null),
    onSuccess: () => {
      setConfirmRemove(null);
      refresh();
    },
    onError,
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-neutral-900">Passkeys</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Sign in with your device&apos;s fingerprint, face or PIN, or with a security key. Passkeys
          can&apos;t be phished and count as two-factor authentication for doctors.
        </p>
      </div>

      {!supported && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This browser does not support passkeys.
        </p>
      )}

      {error && (
        <p role="alert" className="bg-danger-50 text-danger-700 rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {backupCodes && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <p className="font-medium text-neutral-900">Save your backup codes</p>
          <p className="mt-1 text-neutral-600">
            Use one of these if you lose access to your passkeys. Each works once and they will not
            be shown again.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-1 font-mono" aria-label="Backup codes">
            {backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setBackupCodes(null)}>
            I&apos;ve saved them
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading passkeys…</p>
      ) : passkeys.length === 0 ? (
        <p className="text-sm text-neutral-500">No passkeys yet.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {passkeys.map((p: Passkey) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              {editing?.id === p.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (editing.name.trim()) {
                      renameMutation.mutate({ id: p.id, name: editing.name.trim() });
                    }
                  }}
                >
                  <input
                    aria-label="Passkey name"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
                    maxLength={64}
                    value={editing.name}
                    onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                  />
                  <Button type="submit" size="sm" loading={renameMutation.isPending}>
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">{p.name}</p>
                    <p className="text-xs text-neutral-500">
                      Added {formatDate(p.createdAt)} · Last used {formatDate(p.lastUsedAt)}
                      {p.backedUp ? ' · Synced' : ''}
                    </p>
                  </div>
                  {confirmRemove === p.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-700">Remove this passkey?</span>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(p.id)}
                      >
                        Remove
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmRemove(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing({ id: p.id, name: p.name })}
                      >
                        Rename
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmRemove(p.id)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {supported && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate();
          }}
        >
          <input
            aria-label="New passkey name"
            placeholder="Name (e.g. Exam room laptop)"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
            maxLength={64}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" size="sm" loading={addMutation.isPending}>
            Add a passkey
          </Button>
        </form>
      )}
    </div>
  );
}
