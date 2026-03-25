"use client";

import { useState, useEffect, useCallback } from "react";
import { type Patient, formatDate } from "@health-watchers/types";
import { ErrorMessage } from "@/components/ui";

interface Labels {
  title: string;
  loading: string;
  empty: string;
  id: string;
  name: string;
  dob: string;
  sex: string;
  contact: string;
}

export default function PatientsClient({ labels }: { labels: Labels }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPatients = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("http://localhost:3001/api/v1/patients")
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((data) => { setPatients(data.data || []); setLoading(false); })
      .catch((err) => { setError(err.message || "Failed to load patients."); setLoading(false); });
  }, []);

  useEffect(() => { fetchPatients(); }, [fetchPatients]);

  if (loading) {
    return (
      <p role="status" aria-live="polite" className="px-4 py-8 text-gray-500">
        {labels.loading}
      </p>
    );
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={fetchPatients} />;
  }

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">{labels.title}</h1>
      {patients.length === 0 ? (
        <p role="status" className="text-gray-500">{labels.empty}</p>
      ) : (
        <>
          {/* Card layout on mobile */}
          <div className="md:hidden flex flex-col gap-4">
            {patients.map((p) => (
              <div key={p._id} className="rounded border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.id}</p>
                <p className="font-medium text-gray-900">{p.systemId}</p>
                <p className="mt-2 text-xs text-gray-500 uppercase tracking-wide">{labels.name}</p>
                <p className="font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                <p className="mt-2 text-xs text-gray-500 uppercase tracking-wide">{labels.dob}</p>
                <p className="text-gray-700">{formatDate(p.dateOfBirth)}</p>
                <p className="mt-2 text-xs text-gray-500 uppercase tracking-wide">{labels.sex}</p>
                <p className="text-gray-700">{p.sex}</p>
                <p className="mt-2 text-xs text-gray-500 uppercase tracking-wide">{labels.contact}</p>
                <p className="text-gray-700">{p.contactNumber || 'N/A'}</p>
              </div>
            ))}
          </div>

          {/* Table on md+ */}
          <div className="hidden md:block overflow-x-auto">
            <table aria-label={labels.title} className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.id}</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.name}</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.dob}</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.sex}</th>
                  <th scope="col" className="border border-gray-200 px-4 py-2 text-left">{labels.contact}</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p._id} className="even:bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">{p.systemId}</td>
                    <td className="border border-gray-200 px-4 py-2">{p.firstName} {p.lastName}</td>
                    <td className="border border-gray-200 px-4 py-2">{formatDate(p.dateOfBirth)}</td>
                    <td className="border border-gray-200 px-4 py-2">{p.sex}</td>
                    <td className="border border-gray-200 px-4 py-2">{p.contactNumber || 'N/A'}</td>
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
