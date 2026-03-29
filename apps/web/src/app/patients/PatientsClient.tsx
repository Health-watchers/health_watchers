'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { type Patient, formatDate } from '@health-watchers/types';
import { ErrorMessage, TableSkeleton, ModuleEmptyState, Button } from '@/components/ui';
import { queryKeys } from '@/lib/queryKeys';

interface Labels {
  title: string;
  loading: string;
  empty: string;
  id: string;
  name: string;
  dob: string;
  sex: string;
  contact: string;
  search: string;
  view: string;
}

export default function PatientsClient({ labels }: { labels: Labels }) {
  const [searchQuery, setSearchQuery] = useState('');
  const debounceTimer = useRef<NodeJS.Timeout>();

  const {
    data: patients = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.patients.list(searchQuery || undefined),
    queryFn: async () => {
      const url = searchQuery
        ? `http://localhost:3001/api/v1/patients/search?q=${encodeURIComponent(searchQuery)}`
        : 'http://localhost:3001/api/v1/patients';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      return data.data || [];
    },
  });

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {}, 300);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">{labels.title}</h1>
      <div className="mb-6">
        <input
          type="text"
          placeholder={labels.search}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={labels.search}
        />
      </div>
      {isLoading ? (
        <TableSkeleton columns={6} rows={5} />
      ) : error ? (
        <ErrorMessage
          message={error instanceof Error ? error.message : 'Failed to load patients.'}
          onRetry={() => window.location.reload()}
        />
      ) : patients.length === 0 ? (
        <ModuleEmptyState
          module="patients"
          action={
            <Button variant="primary" size="md" className="mt-2">
              Add New Patient
            </Button>
          }
        />
      ) : (
        <>
          <div className="md:hidden flex flex-col gap-4">
            {patients.map((p: Patient) => (
              <div key={p._id} className="rounded border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.id}</p>
                <p className="font-medium text-gray-900">{p.systemId}</p>
                <p className="mt-2 text-xs text-gray-500 uppercase tracking-wide">{labels.name}</p>
                <p className="font-medium text-gray-900">
                  {p.firstName} {p.lastName}
                </p>
                <p className="mt-2 text-xs text-gray-500 uppercase tracking-wide">{labels.dob}</p>
                <p className="text-gray-700">{formatDate(p.dateOfBirth)}</p>
                <p className="mt-2 text-xs text-gray-500 uppercase tracking-wide">{labels.sex}</p>
                <p className="text-gray-700">{p.sex}</p>
                <p className="mt-2 text-xs text-gray-500 uppercase tracking-wide">
                  {labels.contact}
                </p>
                <p className="text-gray-700">{p.contactNumber || 'N/A'}</p>
                <Link
                  href={`/patients/${p._id}`}
                  className="mt-3 inline-block px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  {labels.view}
                </Link>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table aria-label={labels.title} className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {labels.id}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {labels.name}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {labels.dob}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {labels.sex}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {labels.contact}
                  </th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">
                    {labels.view}
                  </th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p: Patient) => (
                  <tr key={p._id} className="even:bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">{p.systemId}</td>
                    <td className="border border-gray-200 px-4 py-2">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="border border-gray-200 px-4 py-2">
                      {formatDate(p.dateOfBirth)}
                    </td>
                    <td className="border border-gray-200 px-4 py-2">{p.sex}</td>
                    <td className="border border-gray-200 px-4 py-2">{p.contactNumber || 'N/A'}</td>
                    <td className="border border-gray-200 px-4 py-2">
                      <Link href={`/patients/${p._id}`} className="text-blue-600 hover:underline">
                        {labels.view}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
