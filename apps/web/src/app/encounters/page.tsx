'use client';

import { useState, useEffect } from 'react';
import { PageWrapper, PageHeader, Card, CardContent } from '@/components/ui';

interface Encounter {
  id: string;
  patientId: string;
  date: string;
  notes: string;
}

export default function EncountersPage() {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/v1/encounters')
      .then(res => res.json())
      .then(data => {
        setEncounters(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <PageWrapper className="py-8">
        <div className="flex items-center justify-center">
          <p className="text-secondary-600">Loading encounters...</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="py-8">
      <PageHeader title="Encounters" />
      <div className="space-y-4">
        {encounters.map(encounter => (
          <Card key={encounter.id}>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="font-medium text-secondary-900">ID:</span>{' '}
                  <span className="font-mono text-secondary-700">{encounter.id}</span>
                </div>
                <div>
                  <span className="font-medium text-secondary-900">Patient:</span>{' '}
                  <span className="text-secondary-700">{encounter.patientId}</span>
                </div>
                <div>
                  <span className="font-medium text-secondary-900">Date:</span>{' '}
                  <span className="text-secondary-700">{encounter.date}</span>
                </div>
              </div>
              <div>
                <span className="font-medium text-secondary-900">Notes:</span>{' '}
                <span className="text-secondary-700">{encounter.notes}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {encounters.length === 0 && (
          <div className="text-center py-8">
            <p className="text-secondary-600">No encounters found.</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
