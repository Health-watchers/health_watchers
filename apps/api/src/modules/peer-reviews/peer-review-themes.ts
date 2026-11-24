/**
 * Lightweight keyword-based theme extraction for peer review feedback.
 *
 * Free-text comments and recommendations are matched against a fixed dictionary of clinical
 * quality themes so the analytics view can surface recurring feedback without storing or
 * shipping the raw comment text to aggregate consumers.
 */

export interface FeedbackTheme {
  key: string;
  label: string;
  keywords: string[];
}

export const FEEDBACK_THEMES: FeedbackTheme[] = [
  {
    key: 'documentation',
    label: 'Documentation completeness',
    keywords: ['document', 'soap', 'note', 'incomplete', 'missing', 'detail', 'chart'],
  },
  {
    key: 'history',
    label: 'History taking',
    keywords: ['history', 'hpi', 'onset', 'family history', 'social history', 'allerg'],
  },
  {
    key: 'examination',
    label: 'Physical examination',
    keywords: ['exam', 'examination', 'vitals', 'vital sign', 'auscultat', 'palpat'],
  },
  {
    key: 'diagnosis',
    label: 'Diagnostic reasoning',
    keywords: ['diagnos', 'differential', 'assessment', 'icd', 'misdiagnos'],
  },
  {
    key: 'investigations',
    label: 'Investigations & labs',
    keywords: ['lab', 'test', 'imaging', 'x-ray', 'xray', 'blood work', 'investigation'],
  },
  {
    key: 'prescribing',
    label: 'Prescribing & medication safety',
    keywords: ['prescri', 'medication', 'dose', 'dosage', 'drug', 'interaction', 'antibiotic'],
  },
  {
    key: 'guidelines',
    label: 'Guideline adherence',
    keywords: ['guideline', 'protocol', 'evidence', 'best practice', 'standard of care'],
  },
  {
    key: 'followUp',
    label: 'Follow-up & safety-netting',
    keywords: ['follow-up', 'follow up', 'followup', 'safety net', 'safety-net', 'referr', 'recall'],
  },
  {
    key: 'communication',
    label: 'Patient communication',
    keywords: ['communicat', 'explain', 'consent', 'educat', 'counsel', 'rapport'],
  },
  {
    key: 'timeliness',
    label: 'Timeliness',
    keywords: ['delay', 'late', 'timely', 'prompt', 'wait'],
  },
];

/** Returns the keys of every theme mentioned in `text` (case-insensitive, deduplicated). */
export function extractThemes(text: string | undefined | null): string[] {
  if (!text) return [];
  const haystack = text.toLowerCase();
  return FEEDBACK_THEMES.filter((t) => t.keywords.some((k) => haystack.includes(k))).map(
    (t) => t.key
  );
}

export interface ThemeCount {
  key: string;
  label: string;
  count: number;
  /** Share of analysed reviews that mention the theme, 0–1 */
  share: number;
}

/**
 * Counts how many reviews mention each theme. A review counts at most once per theme even if
 * both its comments and recommendations mention it.
 */
export function summariseThemes(
  reviews: { feedback?: string | null; recommendations?: string | null }[],
  limit = 5
): ThemeCount[] {
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const keys = new Set([...extractThemes(r.feedback), ...extractThemes(r.recommendations)]);
    keys.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
  }
  const total = reviews.length || 1;
  return FEEDBACK_THEMES.filter((t) => counts.has(t.key))
    .map((t) => ({ key: t.key, label: t.label, count: counts.get(t.key)!, share: counts.get(t.key)! / total }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
