'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { API_V1 } from '@/lib/api';

export interface DosageResult {
  recommendedDose: string;
  frequency: string;
  route: string;
  maxDailyDose: string;
  pediatricAdjustment: boolean;
  renalAdjustment: boolean;
  warnings: string[];
  contraindications: string[];
  disclaimer: string;
}

interface Props {
  drugName: string;
  patientWeight?: number;
  patientAge?: number;
  patientSex?: 'M' | 'F';
  indication?: string;
  onApply: (result: DosageResult) => void;
}

export default function DosageCalculator({
  drugName,
  patientWeight,
  patientAge,
  patientSex,
  indication,
  onApply,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DosageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local overrides when patient data is incomplete
  const [localWeight, setLocalWeight] = useState('');
  const [localAge, setLocalAge] = useState('');
  const [localSex, setLocalSex] = useState<'M' | 'F'>('M');
  const [localIndication, setLocalIndication] = useState('');
  const [renalFunction, setRenalFunction] = useState<string>('normal');
  const [hepaticFunction, setHepatic] = useState<string>('normal');

  const effectiveWeight = patientWeight ?? parseFloat(localWeight);
  const effectiveAge = patientAge ?? parseFloat(localAge);
  const effectiveSex = patientSex ?? localSex;
  const effectiveIndication = indication || localIndication;

  const canCalculate =
    drugName.trim() &&
    effectiveWeight > 0 &&
    effectiveAge >= 0 &&
    effectiveSex &&
    effectiveIndication.trim();

  const calculate = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API_V1}/ai/dosage-calculator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drugName,
          patientWeight: effectiveWeight,
          patientAge: effectiveAge,
          patientSex: effectiveSex,
          indication: effectiveIndication,
          renalFunction: renalFunction !== 'normal' ? renalFunction : undefined,
          hepaticFunction: hepaticFunction !== 'normal' ? hepaticFunction : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Calculation failed');
      setResult(data.data as DosageResult);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result) {
      onApply(result);
      setOpen(false);
      setResult(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          setResult(null);
          setError(null);
        }}
        disabled={!drugName.trim()}
        className="border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-40"
        aria-label={`Calculate dose for ${drugName}`}
      >
        <span aria-hidden="true">⚕</span> Calculate Dose
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Dosage Calculator — ${drugName}`}
        size="md"
      >
        <div className="space-y-4">
          {/* Missing patient data inputs */}
          {(!patientWeight || !patientAge || !patientSex || !indication) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="mb-2 font-medium">Complete missing patient parameters:</p>
              <div className="grid grid-cols-2 gap-3">
                {!patientWeight && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">Weight (kg)</span>
                    <input
                      type="number"
                      min={0.5}
                      max={500}
                      step={0.1}
                      value={localWeight}
                      onChange={(e) => setLocalWeight(e.target.value)}
                      className="rounded border border-amber-300 px-2 py-1 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                      placeholder="e.g. 70"
                    />
                  </label>
                )}
                {!patientAge && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">Age (years)</span>
                    <input
                      type="number"
                      min={0}
                      max={150}
                      value={localAge}
                      onChange={(e) => setLocalAge(e.target.value)}
                      className="rounded border border-amber-300 px-2 py-1 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                      placeholder="e.g. 35"
                    />
                  </label>
                )}
                {!patientSex && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium">Sex</span>
                    <select
                      value={localSex}
                      onChange={(e) => setLocalSex(e.target.value as 'M' | 'F')}
                      className="rounded border border-amber-300 px-2 py-1 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </label>
                )}
                {!indication && (
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-xs font-medium">Indication</span>
                    <input
                      type="text"
                      value={localIndication}
                      onChange={(e) => setLocalIndication(e.target.value)}
                      className="rounded border border-amber-300 px-2 py-1 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                      placeholder="e.g. community-acquired pneumonia"
                    />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Organ function adjustments */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Renal function</span>
              <select
                value={renalFunction}
                onChange={(e) => setRenalFunction(e.target.value)}
                className="rounded border border-neutral-300 px-2 py-1 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="mild_impairment">Mild impairment</option>
                <option value="moderate_impairment">Moderate impairment</option>
                <option value="severe_impairment">Severe impairment</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-600">Hepatic function</span>
              <select
                value={hepaticFunction}
                onChange={(e) => setHepatic(e.target.value)}
                className="rounded border border-neutral-300 px-2 py-1 text-sm focus:ring-2 focus:ring-purple-400 focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="impaired">Impaired</option>
              </select>
            </label>
          </div>

          <Button
            onClick={calculate}
            disabled={loading || !canCalculate}
            loading={loading}
            className="w-full"
          >
            {loading ? 'Calculating…' : 'Calculate'}
          </Button>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              {/* Contraindications — red */}
              {result.contraindications.length > 0 && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3" role="alert">
                  <p className="mb-1 text-sm font-semibold text-red-800">⛔ Contraindications</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-sm text-red-700">
                    {result.contraindications.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings — amber */}
              {result.warnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3" role="alert">
                  <p className="mb-1 text-sm font-semibold text-amber-800">⚠ Warnings</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-sm text-amber-700">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Dose details */}
              <div className="space-y-1.5 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <Row label="Recommended dose" value={result.recommendedDose} />
                <Row label="Frequency" value={result.frequency} />
                <Row label="Route" value={result.route} />
                <Row label="Max daily dose" value={result.maxDailyDose} />
                {result.pediatricAdjustment && (
                  <p className="text-xs font-medium text-blue-700">
                    ✓ Pediatric weight-based adjustment applied
                  </p>
                )}
                {result.renalAdjustment && (
                  <p className="text-xs font-medium text-blue-700">
                    ✓ Renal dose adjustment applied
                  </p>
                )}
              </div>

              {/* Disclaimer */}
              <p className="text-xs text-neutral-500 italic">{result.disclaimer}</p>

              {/* Confirmation */}
              <div className="flex gap-3 pt-1">
                <Button variant="secondary" onClick={() => setResult(null)} className="flex-1">
                  Recalculate
                </Button>
                <Button
                  onClick={handleApply}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  disabled={result.contraindications.length > 0}
                >
                  Apply to prescription
                </Button>
              </div>
              {result.contraindications.length > 0 && (
                <p className="text-center text-xs text-red-600">
                  Cannot apply — contraindications present. Review before prescribing.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value}</span>
    </div>
  );
}
