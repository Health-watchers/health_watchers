'use client';

interface SoapNotes {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
}

const SOAP_LABELS = [
  { key: 'subjective' as const, label: 'Subjective', color: 'border-blue-400'   },
  { key: 'objective'  as const, label: 'Objective',  color: 'border-green-400'  },
  { key: 'assessment' as const, label: 'Assessment', color: 'border-yellow-400' },
  { key: 'plan'       as const, label: 'Plan',       color: 'border-purple-400' },
];

export function SoapNotesView({ soapNotes }: { soapNotes?: SoapNotes }) {
  if (!soapNotes || !Object.values(soapNotes).some(Boolean)) {
    return <p className="text-sm text-secondary-400 italic">No SOAP notes recorded.</p>;
  }

  return (
    <div className="space-y-4">
      {SOAP_LABELS.map(({ key, label, color }) => {
        const html = soapNotes[key];
        if (!html) return null;
        return (
          <div key={key} className={`border-l-4 pl-4 ${color}`}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-secondary-500">{label}</p>
            {/* Safe — HTML was sanitized server-side before storage */}
            <div
              className="prose prose-sm max-w-none text-secondary-800"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        );
      })}
    </div>
  );
}
