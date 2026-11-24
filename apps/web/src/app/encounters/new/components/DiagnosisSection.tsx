import { Input, Button, Badge } from '@/components/ui';

export interface DiagnosisEntry {
  code: string;
  description: string;
  isPrimary: boolean;
}

export interface AiDifferential {
  diagnosis: string;
  icdCode: string;
  probability: 'high' | 'medium' | 'low';
  reasoning: string;
  recommendedTests: string[];
}

export interface AiResponse {
  success: boolean;
  differentials: AiDifferential[];
  urgency: 'routine' | 'urgent' | 'emergency';
  disclaimer: string;
}

export const ICD10_COMMON: DiagnosisEntry[] = [
  {
    code: 'J06.9',
    description: 'Acute upper respiratory infection, unspecified',
    isPrimary: false,
  },
  { code: 'J18.9', description: 'Pneumonia, unspecified organism', isPrimary: false },
  { code: 'I10', description: 'Essential (primary) hypertension', isPrimary: false },
  {
    code: 'E11.9',
    description: 'Type 2 diabetes mellitus without complications',
    isPrimary: false,
  },
  { code: 'M54.5', description: 'Low back pain', isPrimary: false },
  {
    code: 'K21.0',
    description: 'Gastro-oesophageal reflux disease with oesophagitis',
    isPrimary: false,
  },
  {
    code: 'F32.9',
    description: 'Major depressive disorder, single episode, unspecified',
    isPrimary: false,
  },
  { code: 'J45.909', description: 'Unspecified asthma, uncomplicated', isPrimary: false },
  { code: 'N39.0', description: 'Urinary tract infection, site not specified', isPrimary: false },
  { code: 'R51', description: 'Headache', isPrimary: false },
  { code: 'R05', description: 'Cough', isPrimary: false },
  { code: 'R50.9', description: 'Fever, unspecified', isPrimary: false },
];

interface DiagnosisSectionProps {
  chiefComplaint: string;
  notes: string;
  diagnoses: DiagnosisEntry[];
  dxQuery: string;
  setDxQuery: (q: string) => void;
  dxSuggestions: DiagnosisEntry[];
  aiSuggestions: AiResponse | null;
  fetchingAi: boolean;
  onAddDiagnosis: (d: DiagnosisEntry) => void;
  onRemoveDiagnosis: (code: string) => void;
  onGetAiSuggestions: () => void;
  onDismissAi: () => void;
  chiefComplaintError?: string;
}

export function DiagnosisSection({
  chiefComplaint,
  notes,
  diagnoses,
  dxQuery,
  setDxQuery,
  dxSuggestions,
  aiSuggestions,
  fetchingAi,
  onAddDiagnosis,
  onRemoveDiagnosis,
  onGetAiSuggestions,
  onDismissAi,
  chiefComplaintError,
}: DiagnosisSectionProps) {
  return (
    <>
      {/* ── Diagnosis (ICD-10) ── */}
      <section aria-labelledby="section-dx">
        <h2
          id="section-dx"
          className="mb-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase"
        >
          Diagnosis (ICD-10){' '}
          <span className="font-normal text-neutral-400 normal-case">— up to 10</span>
        </h2>

        {diagnoses.length > 0 && (
          <ul className="mb-3 space-y-1" aria-label="Selected diagnoses">
            {diagnoses.map((d, i) => (
              <li
                key={d.code}
                className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
              >
                <span>
                  <span className="text-primary-700 font-mono font-medium">{d.code}</span>
                  <span className="ml-2 text-neutral-700">{d.description}</span>
                  {i === 0 && <span className="ml-2 text-xs text-neutral-400">(primary)</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveDiagnosis(d.code)}
                  aria-label={`Remove ${d.code}`}
                  className="hover:text-danger-500 focus-visible:ring-primary-500 ml-3 rounded text-neutral-400 focus:outline-none focus-visible:ring-2"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {diagnoses.length < 10 && (
          <div className="relative">
            <Input
              label="Search ICD-10 code or description"
              value={dxQuery}
              onChange={(e) => setDxQuery(e.target.value)}
              placeholder="e.g. J06.9 or hypertension"
              aria-autocomplete="list"
              aria-controls="dx-listbox"
              aria-expanded={dxSuggestions.length > 0}
              autoComplete="off"
            />
            {dxSuggestions.length > 0 && (
              <ul
                id="dx-listbox"
                role="listbox"
                aria-label="ICD-10 suggestions"
                className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg"
              >
                {dxSuggestions.map((d) => (
                  <li
                    key={d.code}
                    role="option"
                    aria-selected={diagnoses.some((x) => x.code === d.code)}
                    className="hover:bg-primary-50 focus:bg-primary-50 cursor-pointer px-4 py-2 text-sm outline-none"
                    tabIndex={0}
                    onClick={() => onAddDiagnosis(d)}
                    onKeyDown={(e) => e.key === 'Enter' && onAddDiagnosis(d)}
                  >
                    <span className="text-primary-700 font-mono font-medium">{d.code}</span>
                    <span className="ml-2 text-neutral-600">{d.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ── AI Suggestions (attached to chief complaint context) ── */}
      <section aria-labelledby="section-ai">
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={onGetAiSuggestions}
            loading={fetchingAi}
            disabled={fetchingAi || !chiefComplaint.trim()}
            className="border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            <span className="mr-2">✨</span>
            Get AI Suggestions
          </Button>
        </div>

        {aiSuggestions && (
          <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/30 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white uppercase">
                  Differential Diagnosis AI
                </span>
                <Badge
                  variant={
                    aiSuggestions.urgency === 'emergency'
                      ? 'danger'
                      : aiSuggestions.urgency === 'urgent'
                        ? 'warning'
                        : 'success'
                  }
                >
                  {aiSuggestions.urgency} urgency
                </Badge>
              </div>
              <button onClick={onDismissAi} className="text-neutral-400 hover:text-neutral-600">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {aiSuggestions.differentials.map((diff, i) => (
                <div key={i} className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-neutral-900">{diff.diagnosis}</h3>
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
                          {diff.icdCode}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                        {diff.reasoning}
                      </p>
                      {diff.recommendedTests?.length > 0 && (
                        <p className="mt-2 text-[10px] text-neutral-400">
                          Recommended: {diff.recommendedTests.join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          diff.probability === 'high'
                            ? 'bg-red-50 text-red-700'
                            : diff.probability === 'medium'
                              ? 'bg-orange-50 text-orange-700'
                              : 'bg-green-50 text-green-700'
                        }`}
                      >
                        {diff.probability} probability
                      </span>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() =>
                          onAddDiagnosis({
                            code: diff.icdCode,
                            description: diff.diagnosis,
                            isPrimary: diagnoses.length === 0,
                          })
                        }
                        disabled={diagnoses.some((d) => d.code === diff.icdCode)}
                      >
                        {diagnoses.some((d) => d.code === diff.icdCode) ? 'Added' : 'Add Diagnosis'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-4 text-[10px] text-neutral-400 italic">{aiSuggestions.disclaimer}</p>
          </div>
        )}
      </section>
    </>
  );
}
