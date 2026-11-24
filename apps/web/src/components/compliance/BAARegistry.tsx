'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { DocumentUploadZone } from '@/components/documents/DocumentUploadZone';
import { API_V1, apiV1Fetch } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import {
  BAA_EXPIRY_WARNING_DAYS,
  BAA_STATUSES,
  baaExpiry,
  type BAA,
  type BAAStatus,
} from '@/lib/compliance';

interface BAAFormState {
  businessAssociate: string;
  status: BAAStatus;
  signedDate: string;
  expiryDate: string;
  notes: string;
}

const EMPTY_FORM: BAAFormState = {
  businessAssociate: '',
  status: 'pending',
  signedDate: '',
  expiryDate: '',
  notes: '',
};

function toDateInput(iso?: string) {
  return iso ? iso.slice(0, 10) : '';
}

function ExpiryBadge({ baa, now }: { baa: BAA; now: number }) {
  const { state, daysLeft } = baaExpiry(baa, now);
  if (state === 'expired') return <Badge variant="danger">Expired</Badge>;
  if (state === 'expiring') {
    return (
      <Badge variant="warning">
        Expires in {daysLeft} day{daysLeft === 1 ? '' : 's'}
      </Badge>
    );
  }
  if (state === 'active') return <Badge variant="success">Active</Badge>;
  return <Badge>No expiry set</Badge>;
}

export function BAARegistry({ baas, now = Date.now() }: { baas: BAA[]; now?: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<BAA | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BAAFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const sorted = [...baas].sort((a, b) => {
    const ea = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
    const eb = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
    return ea - eb;
  });

  const save = useMutation({
    mutationFn: (payload: BAAFormState) =>
      apiV1Fetch('/compliance/baas', {
        method: 'POST',
        body: JSON.stringify({
          businessAssociate: payload.businessAssociate.trim(),
          status: payload.status,
          signedDate: payload.signedDate || undefined,
          expiryDate: payload.expiryDate || undefined,
          notes: payload.notes || undefined,
        }),
      }) as Promise<BAA>,
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.compliance.baas() });
      // Keep the modal open so the signed document can be attached
      setEditing(saved);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const openModal = (baa: BAA | null) => {
    setEditing(baa);
    setFormError(null);
    setForm(
      baa
        ? {
            businessAssociate: baa.businessAssociate,
            status: baa.status,
            signedDate: toDateInput(baa.signedDate),
            expiryDate: toDateInput(baa.expiryDate),
            notes: baa.notes ?? '',
          }
        : EMPTY_FORM
    );
    setOpen(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.businessAssociate.trim()) {
      setFormError('Business associate is required');
      return;
    }
    if (form.signedDate && form.expiryDate && form.expiryDate < form.signedDate) {
      setFormError('Expiry date must be after the signed date');
      return;
    }
    setFormError(null);
    save.mutate(form);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-500">
          Agreements expiring within {BAA_EXPIRY_WARNING_DAYS} days are highlighted.
        </p>
        <Button size="sm" onClick={() => openModal(null)}>
          Add BAA
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
        <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-neutral-700">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              {['Business associate', 'Status', 'Signed', 'Expires', 'Document', ''].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-2 text-left text-xs font-semibold tracking-wide text-neutral-500 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white dark:divide-neutral-800 dark:bg-neutral-800">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  No business associate agreements recorded.
                </td>
              </tr>
            )}
            {sorted.map((baa) => {
              const { state } = baaExpiry(baa, now);
              return (
                <tr
                  key={baa._id}
                  data-expiry={state}
                  className={
                    state === 'expiring'
                      ? 'bg-warning-50 dark:bg-warning-900/20'
                      : state === 'expired'
                        ? 'bg-danger-50 dark:bg-danger-900/20'
                        : undefined
                  }
                >
                  <td className="px-4 py-2 font-medium text-neutral-900 dark:text-neutral-100">
                    {baa.businessAssociate}
                  </td>
                  <td className="px-4 py-2 capitalize">{baa.status}</td>
                  <td className="px-4 py-2">
                    {baa.signedDate ? new Date(baa.signedDate).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col gap-1">
                      <span>
                        {baa.expiryDate ? new Date(baa.expiryDate).toLocaleDateString() : '—'}
                      </span>
                      <ExpiryBadge baa={baa} now={now} />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {baa.documentUrl ? (
                      <a
                        href={`${API_V1}/compliance/baas/${baa._id}/document`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline"
                      >
                        {baa.documentFileName ?? 'View'}
                      </a>
                    ) : (
                      <span className="text-neutral-400">Missing</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openModal(baa)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `BAA — ${editing.businessAssociate}` : 'Add business associate agreement'}
        size="lg"
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            id="baa-associate"
            label="Business associate"
            value={form.businessAssociate}
            // The API upserts on this name, so it is fixed once the record exists
            disabled={Boolean(editing)}
            onChange={(e) => setForm({ ...form, businessAssociate: e.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              id="baa-status"
              label="Status"
              value={form.status}
              options={BAA_STATUSES.map((s) => ({ value: s, label: s }))}
              onChange={(e) => setForm({ ...form, status: e.target.value as BAAStatus })}
            />
            <Input
              id="baa-signed"
              label="Signed date"
              type="date"
              value={form.signedDate}
              onChange={(e) => setForm({ ...form, signedDate: e.target.value })}
            />
            <Input
              id="baa-expiry"
              label="Expiry date"
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
            />
          </div>
          <Textarea
            id="baa-notes"
            label="Notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          {formError && (
            <p role="alert" className="text-danger-600 text-sm">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" loading={save.isPending} disabled={save.isPending}>
              Save details
            </Button>
          </div>
        </form>

        <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <h3 className="mb-2 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Signed agreement
          </h3>
          {editing ? (
            <DocumentUploadZone
              uploadUrl={`${API_V1}/compliance/baas/${editing._id}/document`}
              documentTypes={[]}
              accept=".pdf,.jpg,.jpeg,.png"
              hint="PDF, JPEG or PNG — max 20 MB"
              onUploaded={(uploaded) => {
                if (uploaded && typeof uploaded === 'object') setEditing(uploaded as BAA);
                queryClient.invalidateQueries({ queryKey: queryKeys.compliance.baas() });
              }}
            />
          ) : (
            <p className="text-sm text-neutral-500">
              Save the agreement details to attach a document.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
