'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorMessage, Spinner } from '@/components/ui';
import { API_V1 } from '@/lib/api';
import { DocumentList } from '@/components/documents/DocumentList';
import { DocumentUploadZone } from '@/components/documents/DocumentUploadZone';
import { DocumentViewer, type Document } from '@/components/documents/DocumentViewer';
import { useAuth } from '@/context/AuthContext';

const UPLOAD_ROLES = new Set(['DOCTOR', 'CLINIC_ADMIN', 'SUPER_ADMIN', 'NURSE']);

interface PatientDocumentsTabProps {
  patientId: string;
  clinicId: string;
}

export function PatientDocumentsTab({ patientId, clinicId }: PatientDocumentsTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState<Document | null>(null);

  const { data: documents = [], isLoading, error } = useQuery<Document[]>({
    queryKey: ['documents', patientId],
    queryFn: async () => {
      const res = await fetch(`${API_V1}/documents?patientId=${patientId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load documents');
      const body = await res.json();
      return body.data ?? [];
    },
  });

  const canUpload = user && UPLOAD_ROLES.has(user.role);

  return (
    <div className="space-y-6">
      {canUpload && (
        <section aria-label="Upload document">
          <DocumentUploadZone
            patientId={patientId}
            clinicId={clinicId}
            onUploaded={() => queryClient.invalidateQueries({ queryKey: ['documents', patientId] })}
          />
        </section>
      )}

      <section aria-label="Patient documents">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <ErrorMessage
            message={error instanceof Error ? error.message : 'Failed to load documents'}
            onRetry={() => queryClient.invalidateQueries({ queryKey: ['documents', patientId] })}
          />
        ) : documents.length === 0 && !canUpload ? (
          <EmptyState title="No documents" description="No documents have been uploaded for this patient." />
        ) : (
          <DocumentList documents={documents} onView={setViewing} />
        )}
      </section>

      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
