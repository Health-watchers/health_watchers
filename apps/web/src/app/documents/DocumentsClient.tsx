'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorMessage,
  PageHeader,
  PageWrapper,
  Select,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { API_V1 } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { DocumentAccessLog } from '@/components/documents/DocumentAccessLog';
import { DocumentAnnotationPanel } from '@/components/documents/DocumentAnnotationPanel';
import { DocumentLibrary } from '@/components/documents/DocumentLibrary';
import { DocumentSearchPanel } from '@/components/documents/DocumentSearchPanel';
import { DocumentThumbnails } from '@/components/documents/DocumentThumbnails';
import { DocumentVersionHistory } from '@/components/documents/DocumentVersionHistory';
import { SecureDocumentViewer } from '@/components/documents/SecureDocumentViewer';
import { annotationsForDocument } from '@/lib/documents/annotations';
import { createAccessEntry } from '@/lib/documents/accessLog';
import { matchedPages, nextMatchIndex, searchDocument } from '@/lib/documents/search';
import {
  SAMPLE_ACCESS_LOG,
  SAMPLE_ANNOTATIONS,
  getSampleDocuments,
} from '@/lib/documents/sampleData';
import type {
  AccessLogEntry,
  DocumentAnnotation,
  DocumentRecord,
  ViewerAction,
} from '@/lib/documents/types';

interface DocumentsPayload {
  documents: DocumentRecord[];
  source: 'api' | 'sample';
}

const PATIENT_OPTIONS = [
  { value: 'p-1001', label: 'Ada Okafor · MRN-1001' },
  { value: 'p-1002', label: 'Chinedu Balogun · MRN-1002' },
];

/**
 * Issue #1316 — the document service may not expose a signed download URL in every
 * environment, so a failed request falls back to the demo library. The fallback
 * is surfaced in the UI.
 */
async function loadDocuments(patientId: string): Promise<DocumentsPayload> {
  try {
    const response = await fetch(`${API_V1}/documents?patientId=${patientId}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`Request failed with ${response.status}`);
    const body = await response.json();
    const payload: unknown = body?.data;
    if (Array.isArray(payload) && payload.length > 0) {
      return { documents: payload as DocumentRecord[], source: 'api' };
    }
    throw new Error('No documents returned');
  } catch {
    return { documents: getSampleDocuments(patientId), source: 'sample' };
  }
}

type PageTab = 'documents' | 'access';
type PanelTab = 'search' | 'annotations' | 'versions';

export default function DocumentsClient() {
  const { user } = useAuth();
  const actor = user?.name ?? 'Clinic staff';

  const [patientId, setPatientId] = useState(PATIENT_OPTIONS[0]?.value ?? 'p-1001');
  const [pageTab, setPageTab] = useState<PageTab>('documents');
  const [panelTab, setPanelTab] = useState<PanelTab>('search');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [annotations, setAnnotations] = useState<DocumentAnnotation[]>(SAMPLE_ANNOTATIONS);
  const [accessLog, setAccessLog] = useState<AccessLogEntry[]>(SAMPLE_ACCESS_LOG);

  const { data, isLoading, error, refetch } = useQuery<DocumentsPayload>({
    queryKey: ['documents', patientId],
    queryFn: () => loadDocuments(patientId),
  });

  const documents = useMemo(() => data?.documents ?? [], [data]);
  const activeDocument = useMemo(
    () => documents.find((item) => item.id === selectedDocumentId) ?? documents[0] ?? null,
    [documents, selectedDocumentId]
  );
  const matches = useMemo(
    () => (activeDocument ? searchDocument(activeDocument, searchQuery) : []),
    [activeDocument, searchQuery]
  );
  const annotationTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const document of documents) {
      totals[document.id] = annotationsForDocument(annotations, document.id).length;
    }
    return totals;
  }, [documents, annotations]);

  const log = useCallback(
    (action: ViewerAction, detail: string, document: DocumentRecord | null) => {
      if (!document) return;
      setAccessLog((current) => [createAccessEntry({ document, action, actor, detail }), ...current]);
    },
    [actor]
  );

  // Record the initial view of a document, once per selection.
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeDocument) return;
    if (viewedRef.current === activeDocument.id) return;
    viewedRef.current = activeDocument.id;
    setPage(1);
    setZoom(1);
    setRotation(0);
    setSearchQuery('');
    setActiveMatchIndex(0);
    setAccessLog((current) => [
      createAccessEntry({
        document: activeDocument,
        action: 'viewed',
        actor,
        detail: `Opened version ${activeDocument.currentVersion}, page 1.`,
      }),
      ...current,
    ]);
  }, [activeDocument, actor]);

  const handleSelectDocument = (document: DocumentRecord) => {
    setSelectedDocumentId(document.id);
    setPanelTab('search');
  };

  const handlePageChange = (nextPage: number) => {
    if (!activeDocument) return;
    const bounded = Math.min(Math.max(nextPage, 1), activeDocument.pageCount);
    if (bounded === page) return;
    setPage(bounded);
    log('page_changed', `Moved to page ${bounded}.`, activeDocument);
  };

  const handleZoomChange = (nextZoom: number) => {
    if (!activeDocument) return;
    setZoom(nextZoom);
    log('zoomed', `Zoom set to ${Math.round(nextZoom * 100)}%.`, activeDocument);
  };

  const handleRotate = (direction: 1 | -1) => {
    if (!activeDocument) return;
    setRotation((current) => current + direction * 90);
    log('rotated', `Rotated ${direction > 0 ? 'right' : 'left'} 90°.`, activeDocument);
  };

  const handleDownload = () => {
    if (!activeDocument) return;
    if (typeof document !== 'undefined') {
      const blob = new Blob([activeDocument.textLines.join('\n\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${activeDocument.fileName}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    log('downloaded', `Downloaded ${activeDocument.fileName}.`, activeDocument);
  };

  const handlePrint = () => {
    if (!activeDocument) return;
    if (typeof window !== 'undefined') window.print();
    log('printed', `Printed ${activeDocument.fileName}.`, activeDocument);
  };

  const handleSearchSubmit = () => {
    if (!activeDocument) return;
    log(
      'searched',
      `Searched for “${searchQuery.trim()}” — ${matches.length} match${
        matches.length === 1 ? '' : 'es'
      }.`,
      activeDocument
    );
  };

  const handleStepMatch = (direction: 1 | -1) => {
    const next = nextMatchIndex(matches.length, activeMatchIndex, direction);
    if (next < 0) return;
    setActiveMatchIndex(next);
    const target = matches[next];
    if (target) setPage(target.page);
  };

  const handleSelectMatch = (index: number) => {
    const target = matches[index];
    if (!target) return;
    setActiveMatchIndex(index);
    setPage(target.page);
  };

  const handleCreateAnnotation = (annotation: DocumentAnnotation) => {
    setAnnotations((current) => [...current, annotation]);
    log('annotated', `Added a ${annotation.type} on page ${annotation.page}.`, activeDocument);
  };

  const handleDeleteAnnotation = (annotationId: string) => {
    const target = annotations.find((annotation) => annotation.id === annotationId);
    setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));
    log(
      'annotation_deleted',
      `Removed an annotation${target ? ` from page ${target.page}` : ''}.`,
      activeDocument
    );
  };

  const handleRestoreVersion = (versionId: string, version: number) => {
    if (!activeDocument) return;
    log('version_restored', `Restored from version ${version} (${versionId}).`, activeDocument);
  };

  return (
    <PageWrapper className="space-y-6 py-6">
      <PageHeader
        title="Documents"
        subtitle={`${patientId === 'p-1001' ? 'Ada Okafor' : 'Chinedu Balogun'} · ${
          documents.length
        } document${documents.length === 1 ? '' : 's'}`}
        actions={
          <div className="w-64">
            <Select
              label="Patient"
              options={PATIENT_OPTIONS}
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
            />
          </div>
        }
      />

      {data?.source === 'sample' && (
        <p
          role="status"
          className="border-warning-200 bg-warning-50 rounded-lg border px-3 py-2 text-sm text-neutral-700"
        >
          The document service is unavailable, so a demo library is shown. Annotations and access
          events are recorded in this session only.
        </p>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load documents'}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !error && (
        <Tabs value={pageTab} onValueChange={(value) => setPageTab(value as PageTab)}>
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="access">Access log</TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            {activeDocument ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
                <Card>
                  <CardHeader>
                    <CardTitle>Library</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DocumentLibrary
                      documents={documents}
                      selectedDocumentId={activeDocument.id}
                      annotationTotals={annotationTotals}
                      onSelect={handleSelectDocument}
                    />
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardContent className="pt-6">
                      <SecureDocumentViewer
                        document={activeDocument}
                        documentUrl={null}
                        page={page}
                        zoom={zoom}
                        rotation={rotation}
                        onPageChange={handlePageChange}
                        onZoomChange={handleZoomChange}
                        onRotate={handleRotate}
                        onDownload={handleDownload}
                        onPrint={handlePrint}
                      />
                    </CardContent>
                  </Card>

                  <DocumentThumbnails
                    document={activeDocument}
                    annotations={annotations}
                    currentPage={page}
                    matchedPages={matchedPages(matches)}
                    onSelectPage={handlePageChange}
                  />

                  <Card>
                    <CardHeader>
                      <CardTitle>Review</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Tabs
                        value={panelTab}
                        onValueChange={(value) => setPanelTab(value as PanelTab)}
                      >
                        <TabsList className="overflow-x-auto">
                          <TabsTrigger value="search">Search</TabsTrigger>
                          <TabsTrigger value="annotations">Annotations</TabsTrigger>
                          <TabsTrigger value="versions">Versions</TabsTrigger>
                        </TabsList>
                        <TabsContent value="search">
                          <DocumentSearchPanel
                            query={searchQuery}
                            matches={matches}
                            activeIndex={activeMatchIndex}
                            onQueryChange={setSearchQuery}
                            onSearchSubmit={handleSearchSubmit}
                            onStep={handleStepMatch}
                            onSelectMatch={handleSelectMatch}
                          />
                        </TabsContent>
                        <TabsContent value="annotations">
                          <DocumentAnnotationPanel
                            document={activeDocument}
                            annotations={annotations}
                            currentPage={page}
                            actor={actor}
                            onCreate={handleCreateAnnotation}
                            onDelete={handleDeleteAnnotation}
                          />
                        </TabsContent>
                        <TabsContent value="versions">
                          <DocumentVersionHistory
                            document={activeDocument}
                            onRestore={handleRestoreVersion}
                          />
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                No documents to view for this patient.
              </p>
            )}
          </TabsContent>

          <TabsContent value="access">
            <DocumentAccessLog entries={accessLog} documentId={null} />
          </TabsContent>
        </Tabs>
      )}
    </PageWrapper>
  );
}
