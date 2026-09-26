import type { DocumentRecord, SearchMatch } from './types';

const CONTEXT_CHARS = 40;
const DEFAULT_MAX_MATCHES = 50;

/**
 * Case-insensitive search across a document's extracted text.
 *
 * Every occurrence is reported (not just the first per line) and each match keeps
 * the offset inside its source line, so the viewer can highlight it exactly and
 * jump to the right page.
 */
export function searchDocument(
  document: DocumentRecord,
  query: string,
  maxMatches = DEFAULT_MAX_MATCHES
): SearchMatch[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];

  const matches: SearchMatch[] = [];

  for (let pageIndex = 0; pageIndex < document.textLines.length; pageIndex += 1) {
    const line = document.textLines[pageIndex] ?? '';
    const lowerLine = line.toLowerCase();
    let cursor = lowerLine.indexOf(term);

    while (cursor !== -1) {
      // Checked before pushing so the cap applies across the whole document.
      if (matches.length >= maxMatches) return matches;

      const start = Math.max(cursor - CONTEXT_CHARS, 0);
      const end = Math.min(cursor + term.length + CONTEXT_CHARS, line.length);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < line.length ? '…' : '';

      matches.push({
        page: pageIndex + 1,
        lineNumber: pageIndex + 1,
        line,
        snippet: `${prefix}${line.slice(start, end)}${suffix}`,
        matchStart: cursor,
        matchLength: term.length,
      });

      cursor = lowerLine.indexOf(term, cursor + term.length);
    }
  }

  return matches;
}

/** Wraps around so "next match" from the last hit returns to the first. */
export function nextMatchIndex(
  matchCount: number,
  current: number,
  direction: 1 | -1
): number {
  if (matchCount <= 0) return -1;
  return (current + direction + matchCount) % matchCount;
}

/** Number of pages that contain at least one match. */
export function matchedPages(matches: readonly SearchMatch[]): number[] {
  return Array.from(new Set(matches.map((match) => match.page))).sort((a, b) => a - b);
}

export function documentMatchesQuery(document: DocumentRecord, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return false;
  return `${document.fileName} ${document.summary} ${document.documentType}`
    .toLowerCase()
    .includes(term);
}
