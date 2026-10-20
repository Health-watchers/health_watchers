---
"web": minor
---

feat(documents): secure document viewer (#1316)

- New `/documents` route (the sidebar already linked to it but no page
  existed) with a document library, viewer, page thumbnails, review panel and
  access log
- `SecureDocumentViewer`: PDF/image rendering through the browser viewer when a
  signed URL is available, extracted-text preview otherwise, plus zoom controls
  (75–300%), rotation, page navigation, download and print
- `DocumentLibrary`: type, access level, size, page count, version, uploader
  and annotation count per document
- `DocumentThumbnails`: per-page selector with annotation and search-match
  badges
- `DocumentSearchPanel`: case-insensitive search across every page with match
  snippets, character offsets, and previous/next navigation that wraps
- `DocumentAnnotationPanel`: page-scoped highlights and notes with removal
- `DocumentVersionHistory`: version list with author, timestamp, size, change
  note and restore action
- `DocumentAccessLog`: audit trail with view/download/print/search/annotation
  counts, action and user filters, newest first
- Domain layer in `src/lib/documents` (types, search, annotations, access log,
  sample library) with 11 unit tests
