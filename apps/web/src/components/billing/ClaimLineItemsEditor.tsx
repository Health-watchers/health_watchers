'use client';

import { Button } from '@/components/ui';
import { formatMoney } from '@/lib/billing';

export interface LineItemDraft {
  cptCode: string;
  amount: string;
}

const field =
  'w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';

/** Editable CPT code + charge rows, shared by claim creation and correct & resubmit. */
export function ClaimLineItemsEditor({
  items,
  onChange,
}: {
  items: LineItemDraft[];
  onChange: (items: LineItemDraft[]) => void;
}) {
  const update = (i: number, patch: Partial<LineItemDraft>) =>
    onChange(items.map((item, j) => (j === i ? { ...item, ...patch } : item)));
  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            aria-label={`CPT code, line ${i + 1}`}
            placeholder="CPT e.g. 99213"
            className={field}
            value={item.cptCode}
            onChange={(e) => update(i, { cptCode: e.target.value.trim() })}
          />
          <input
            aria-label={`Charge, line ${i + 1}`}
            placeholder="0.00"
            inputMode="decimal"
            className={`${field} max-w-[8rem] text-right`}
            value={item.amount}
            onChange={(e) => update(i, { amount: e.target.value.trim() })}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`Remove line ${i + 1}`}
            disabled={items.length === 1}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            ✕
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...items, { cptCode: '', amount: '' }])}
        >
          + Add line
        </Button>
        <span className="text-sm font-medium">Total {formatMoney(total)}</span>
      </div>
    </div>
  );
}

export function validateLineItems(items: LineItemDraft[]): string | null {
  if (items.length === 0) return 'At least one line item is required';
  for (const [i, item] of items.entries()) {
    if (!/^[A-Z0-9]{4,5}$/i.test(item.cptCode)) return `Line ${i + 1}: enter a valid CPT code`;
    if (!/^\d+(\.\d{1,2})?$/.test(item.amount)) return `Line ${i + 1}: enter a valid charge`;
  }
  return null;
}
