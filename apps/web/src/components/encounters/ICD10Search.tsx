'use client';

import { useState, useCallback, useRef } from 'react';

interface ICD10Result {
  code: string;
  description: string;
  category: string;
}

interface SelectedDiagnosis {
  code: string;
  description: string;
  isPrimary: boolean;
}

interface ICD10SearchProps {
  selected: SelectedDiagnosis[];
  onChange: (diagnoses: SelectedDiagnosis[]) => void;
  apiBase?: string;
}

export default function ICD10Search({
  selected,
  onChange,
  apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
}: ICD10SearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ICD10Result[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q.trim()) { setResults([]); return; }

      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const res = await fetch(`${apiBase}/api/v1/icd10/search?q=${encodeURIComponent(q)}&limit=10`);
          const body = await res.json();
          setResults(body.data ?? []);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [apiBase],
  );

  const add = (item: ICD10Result) => {
    if (selected.some((s) => s.code === item.code)) return;
    onChange([...selected, { code: item.code, description: item.description, isPrimary: selected.length === 0 }]);
    setQuery('');
    setResults([]);
  };

  const remove = (code: string) => onChange(selected.filter((s) => s.code !== code));

  const togglePrimary = (code: string) =>
    onChange(selected.map((s) => ({ ...s, isPrimary: s.code === code })));

  return (
    <div>
      {/* Selected diagnoses */}
      {selected.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: '0.5rem' }}>
          {selected.map((s) => (
            <li key={s.code}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.3rem 0.5rem', background: '#f0f9ff',
                borderRadius: 4, marginBottom: '0.25rem', fontSize: '0.85rem',
              }}>
              <span style={{ fontWeight: 600 }}>{s.code}</span>
              <span style={{ flex: 1 }}>{s.description}</span>
              <button
                type="button"
                onClick={() => togglePrimary(s.code)}
                title={s.isPrimary ? 'Primary diagnosis' : 'Set as primary'}
                style={{
                  fontSize: '0.7rem', padding: '0.1rem 0.4rem',
                  background: s.isPrimary ? '#2563eb' : '#e5e7eb',
                  color: s.isPrimary ? '#fff' : '#374151',
                  border: 'none', borderRadius: 3, cursor: 'pointer',
                }}>
                {s.isPrimary ? '★ Primary' : 'Set primary'}
              </button>
              <button
                type="button"
                onClick={() => remove(s.code)}
                aria-label={`Remove ${s.code}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Search input */}
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          placeholder="Search ICD-10 code or description (e.g. J06 or respiratory)"
          aria-label="Search ICD-10 diagnosis codes"
          style={{
            width: '100%', padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db', borderRadius: 6,
            fontSize: '0.875rem', boxSizing: 'border-box',
          }}
        />
        {loading && (
          <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#6b7280' }}>
            Searching…
          </span>
        )}
      </div>

      {/* Dropdown results */}
      {results.length > 0 && (
        <ul role="listbox" aria-label="ICD-10 search results"
          style={{
            listStyle: 'none', padding: 0, margin: '0.25rem 0 0',
            border: '1px solid #d1d5db', borderRadius: 6,
            background: '#fff', maxHeight: 240, overflowY: 'auto',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          }}>
          {results.map((r) => (
            <li key={r.code} role="option"
              onClick={() => add(r)}
              style={{
                padding: '0.5rem 0.75rem', cursor: 'pointer',
                borderBottom: '1px solid #f3f4f6', fontSize: '0.85rem',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f9ff')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
              <span style={{ fontWeight: 600, marginRight: '0.5rem' }}>{r.code}</span>
              {r.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
