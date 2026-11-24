import { Input } from '@/components/ui';

interface VitalsSectionProps {
  vitalsOpen: boolean;
  onToggle: () => void;
  bp: string;
  setBp: (v: string) => void;
  hr: string;
  setHr: (v: string) => void;
  temp: string;
  setTemp: (v: string) => void;
  tempUnit: 'C' | 'F';
  onToggleTempUnit: () => void;
  weight: string;
  setWeight: (v: string) => void;
  weightUnit: 'kg' | 'lbs';
  onToggleWeightUnit: () => void;
  height: string;
  setHeight: (v: string) => void;
  heightUnit: 'cm' | 'in';
  onToggleHeightUnit: () => void;
  spo2: string;
  setSpo2: (v: string) => void;
  errors: Record<string, string>;
}

export function VitalsSection({
  vitalsOpen,
  onToggle,
  bp,
  setBp,
  hr,
  setHr,
  temp,
  setTemp,
  tempUnit,
  onToggleTempUnit,
  weight,
  setWeight,
  weightUnit,
  onToggleWeightUnit,
  height,
  setHeight,
  heightUnit,
  onToggleHeightUnit,
  spo2,
  setSpo2,
  errors,
}: VitalsSectionProps) {
  return (
    <section aria-labelledby="section-vitals">
      <button
        type="button"
        id="section-vitals"
        aria-expanded={vitalsOpen}
        aria-controls="vitals-panel"
        onClick={onToggle}
        className="focus-visible:ring-primary-500 flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-semibold tracking-wide text-neutral-500 uppercase hover:bg-neutral-100 focus:outline-none focus-visible:ring-2"
      >
        <span>
          Vital Signs <span className="font-normal text-neutral-400 normal-case">(optional)</span>
        </span>
        <span aria-hidden="true">{vitalsOpen ? '▲' : '▼'}</span>
      </button>

      {vitalsOpen && (
        <div
          id="vitals-panel"
          className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-neutral-200 p-4 sm:grid-cols-2"
        >
          <Input
            label="Blood Pressure (mmHg)"
            value={bp}
            onChange={(e) => setBp(e.target.value)}
            placeholder="e.g. 120/80"
          />

          <Input
            label="Heart Rate (bpm)"
            type="number"
            min={30}
            max={300}
            value={hr}
            onChange={(e) => setHr(e.target.value)}
            placeholder="30–300"
            error={errors.hr}
          />

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label={`Temperature (°${tempUnit})`}
                type="number"
                step="0.1"
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
                placeholder={tempUnit === 'C' ? '36.5' : '97.7'}
              />
            </div>
            <button
              type="button"
              onClick={onToggleTempUnit}
              className="focus-visible:ring-primary-500 mb-0.5 rounded border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2"
              aria-label={`Switch to °${tempUnit === 'C' ? 'F' : 'C'}`}
            >
              °{tempUnit === 'C' ? 'F' : 'C'}
            </button>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label={`Weight (${weightUnit})`}
                type="number"
                step="0.1"
                min={0}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={weightUnit === 'kg' ? '70' : '154'}
              />
            </div>
            <button
              type="button"
              onClick={onToggleWeightUnit}
              className="focus-visible:ring-primary-500 mb-0.5 rounded border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2"
              aria-label={`Switch to ${weightUnit === 'kg' ? 'lbs' : 'kg'}`}
            >
              {weightUnit === 'kg' ? 'lbs' : 'kg'}
            </button>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label={`Height (${heightUnit})`}
                type="number"
                step="0.1"
                min={0}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder={heightUnit === 'cm' ? '170' : '67'}
              />
            </div>
            <button
              type="button"
              onClick={onToggleHeightUnit}
              className="focus-visible:ring-primary-500 mb-0.5 rounded border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2"
              aria-label={`Switch to ${heightUnit === 'cm' ? 'inches' : 'cm'}`}
            >
              {heightUnit === 'cm' ? 'in' : 'cm'}
            </button>
          </div>

          <Input
            label="Oxygen Saturation (%)"
            type="number"
            min={0}
            max={100}
            value={spo2}
            onChange={(e) => setSpo2(e.target.value)}
            placeholder="0–100"
            error={errors.spo2}
          />
        </div>
      )}
    </section>
  );
}
