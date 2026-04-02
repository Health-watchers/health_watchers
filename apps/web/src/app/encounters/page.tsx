// apps/web/src/app/encounters/page.tsx

'use client';
import { useState, useEffect } from 'react';

interface Encounter {
  _id: string;
  patientId: {
    firstName: string;
    lastName: string;
    systemId: string;
  };
  status: string;
  createdAt: string;
  // ... other fields
}

interface ApiResponse {
  status: string;
  data: Encounter[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export default function EncountersPage() {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  useEffect(() => {
    fetchEncounters();
  }, [page]);

  const fetchEncounters = async () => {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      const response = await fetch(`/api/v1/encounters?${params}`);
      const data: ApiResponse = await response.json();
      
      if (data.status === 'success') {
        setEncounters(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch encounters:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading encounters...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Encounters</h1>
      <div className="grid gap-4">
        {encounters.map((encounter) => (
          <div key={encounter._id} className="p-4 border rounded-lg">
            <div className="font-medium">
              {encounter.patientId?.firstName} {encounter.patientId?.lastName}
              <span className="text-sm text-gray-500 ml-2">
                ({encounter.patientId?.systemId})
              </span>
            </div>
            <div className="text-sm text-gray-600">
              Status: <span className="font-semibold">{encounter.status}</span>
            </div>
            <div className="text-xs text-gray-500">
              {new Date(encounter.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
      
      {/* Pagination */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Previous
        </button>
        <span>
          Page {page} of {Math.ceil(100 / limit)} {/* Replace 100 with meta.total */}
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Next
        </button>
      </div>
    </div>
  );
}