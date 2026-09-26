import { matchedPages, nextMatchIndex, searchDocument } from '@/lib/documents/search';
import {
  annotationCounts,
  annotationsForDocument,
  annotationsForPage,
  createAnnotation,
} from '@/lib/documents/annotations';
import { createAccessEntry, filterAccessLog, summariseAccess } from '@/lib/documents/accessLog';
import {
  SAMPLE_ACCESS_LOG,
  SAMPLE_ANNOTATIONS,
  SAMPLE_DOCUMENTS,
  formatFileSize,
  getSampleDocuments,
} from '@/lib/documents/sampleData';
import type { SearchMatch } from '@/lib/documents/types';

const discharge = SAMPLE_DOCUMENTS[0];
const labReport = SAMPLE_DOCUMENTS[2];

if (!discharge || !labReport) throw new Error('Sample documents are missing');

function sliceMatch(match: SearchMatch): string {
  return match.line.slice(match.matchStart, match.matchStart + match.matchLength);
}

describe('search within documents (#1316)', () => {
  it('finds a term on the correct page', () => {
    const matches = searchDocument(discharge, 'warfarin');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.page).toBe(2);
    expect(sliceMatch(matches[0] as SearchMatch)).toBe('warfarin');
    expect(matches[0]?.snippet).toContain('warfarin');
  });

  it('is case-insensitive', () => {
    const matches = searchDocument(discharge, 'WARFARIN');
    expect(matches).toHaveLength(1);
    expect(sliceMatch(matches[0] as SearchMatch).toLowerCase()).toBe('warfarin');
  });

  it('reports every occurrence on a line', () => {
    const matches = searchDocument(discharge, 'daily');
    expect(matches).toHaveLength(3);
    expect(matches.every((match) => match.page === 2)).toBe(true);
    expect(matches.map(sliceMatch)).toEqual(['daily', 'daily', 'daily']);
  });

  it('applies the match cap across the whole document', () => {
    expect(searchDocument(discharge, 'a', 3)).toHaveLength(3);
    expect(searchDocument(discharge, 'daily', 2)).toHaveLength(2);
  });

  it('returns nothing for an empty query', () => {
    expect(searchDocument(discharge, '')).toEqual([]);
    expect(searchDocument(discharge, '   ')).toEqual([]);
  });

  it('searches other documents and reports matched pages', () => {
    const matches = searchDocument(labReport, 'critical');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.page).toBe(1);
    expect(matchedPages(matches)).toHaveLength(1);
  });

  it('wraps match navigation in both directions', () => {
    expect(nextMatchIndex(3, 2, 1)).toBe(0);
    expect(nextMatchIndex(3, 0, -1)).toBe(2);
    expect(nextMatchIndex(0, 0, 1)).toBe(-1);
  });
});

describe('annotations (#1316)', () => {
  const created = createAnnotation({
    documentId: discharge.id,
    page: 1,
    type: 'note',
    text: '  confirm follow-up  ',
    quote: '  follow-up  ',
    createdBy: 'Dr. Ngozi Eze',
    createdAt: '2026-09-24T10:00:00.000Z',
  });

  it('trims the input and assigns an id', () => {
    expect(created.text).toBe('confirm follow-up');
    expect(created.quote).toBe('follow-up');
    expect(created.id.startsWith('ann-')).toBe(true);
  });

  it('scopes annotations by document and page', () => {
    const all = [...SAMPLE_ANNOTATIONS, created];
    expect(annotationsForDocument(all, 'doc-1')).toHaveLength(3);
    expect(annotationsForDocument(all, 'doc-3')).toHaveLength(1);
    expect(annotationsForPage(all, 'doc-1', 3)).toHaveLength(1);
  });

  it('counts annotations per page for the thumbnails', () => {
    const all = [...SAMPLE_ANNOTATIONS, created];
    expect(annotationCounts(all, discharge)).toEqual([1, 1, 1]);
  });
});

describe('access logging (#1316)', () => {
  it('records who did what to which document', () => {
    const entry = createAccessEntry({
      document: discharge,
      action: 'printed',
      actor: 'Nurse B. Okeke',
      detail: 'Printed pages 1-3.',
      at: '2026-09-24T10:05:00.000Z',
    });
    expect(entry.documentName).toBe(discharge.fileName);
    expect(entry.action).toBe('printed');
    expect(entry.at).toBe('2026-09-24T10:05:00.000Z');
  });

  it('summarises the audit trail', () => {
    const summary = summariseAccess(SAMPLE_ACCESS_LOG);
    expect(summary.total).toBe(5);
    expect(summary.viewed).toBe(2);
    expect(summary.downloaded).toBe(1);
    expect(summary.printed).toBe(1);
    expect(summary.searches).toBe(1);
    expect(summary.annotations).toBe(0);
    expect(summary.distinctActors).toBe(3);
    expect(summary.lastAccessedAt).toBe('2026-09-15T16:52:00.000Z');
  });

  it('filters by action and actor, newest first', () => {
    const viewed = filterAccessLog(SAMPLE_ACCESS_LOG, 'viewed', 'all');
    expect(viewed).toHaveLength(2);
    expect(viewed[0]?.at).toBe('2026-09-15T16:40:00.000Z');

    const byActor = filterAccessLog(SAMPLE_ACCESS_LOG, 'all', 'Dr. Ngozi Eze');
    expect(byActor).toHaveLength(2);
    expect(byActor.every((entry) => entry.actor === 'Dr. Ngozi Eze')).toBe(true);
  });
});

describe('document library (#1316)', () => {
  it('keeps documents scoped to their patient', () => {
    expect(getSampleDocuments('p-1001')).toHaveLength(4);
    expect(getSampleDocuments('p-9999')).toHaveLength(0);
  });

  it('formats file sizes', () => {
    expect(formatFileSize(2_411_776)).toBe('2.3 MB');
    expect(formatFileSize(96_420)).toBe('94.2 KB');
    expect(formatFileSize(512)).toBe('512 B');
  });
});
