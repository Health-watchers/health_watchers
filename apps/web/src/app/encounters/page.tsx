"use client";

import { useMemo, useState } from "react";
import EncounterTable, {
  type EncounterRecord,
  type EncounterStatus,
  MOCK_ENCOUNTERS,
} from "../../components/encounters/EncounterTable";
import EncounterDetail from "../../components/encounters/EncounterDetail";
import EncounterForm, {
  type EncounterFormValues,
} from "../../components/forms/EncounterForm";

function nextStatus(): EncounterStatus {
  return "active";
}

function mapFormToEncounter(
  values: EncounterFormValues,
  existingLength: number,
): EncounterRecord {
  const encounterNumber = String(existingLength + 1).padStart(5, "0");

  return {
    id: `EN-2026-${encounterNumber}`,
    patientName: values.patientName,
    patientMrn: values.patientMrn,
    doctor: values.doctor,
    status: nextStatus(),
    encounterAt: new Date().toISOString(),
    chiefComplaint: values.chiefComplaint,
    diagnosis: values.diagnosis
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    treatmentPlan: values.treatmentPlan,
    prescriptions: values.prescriptions
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => ({
        name: item,
        dose: "As documented",
        frequency: "As directed",
      })),
    vitals: {
      bloodPressure: values.bloodPressure,
      heartRate: values.heartRate,
      temperature: values.temperature,
      spo2: values.spo2,
    },
    followUpDate: values.followUpDate,
  };
}

export default function EncountersPage() {
  const [encounters, setEncounters] =
    useState<EncounterRecord[]>(MOCK_ENCOUNTERS);
  const [selectedEncounterId, setSelectedEncounterId] = useState<string | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);

  const selectedEncounter = useMemo(
    () => encounters.find((item) => item.id === selectedEncounterId) ?? null,
    [encounters, selectedEncounterId],
  );

  const doctors = useMemo(() => {
    const list = Array.from(new Set(encounters.map((item) => item.doctor)));
    return list.length > 0 ? list : ["Dr. Julian Smith"];
  }, [encounters]);

  const handleCreateEncounter = (values: EncounterFormValues) => {
    const next = mapFormToEncounter(values, encounters.length);
    setEncounters((prev) => [next, ...prev]);
    setSelectedEncounterId(next.id);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      {!selectedEncounter ? (
        <EncounterTable
          encounters={encounters}
          onViewDetail={setSelectedEncounterId}
          onNewEncounter={() => setIsFormOpen(true)}
        />
      ) : (
        <EncounterDetail
          encounter={selectedEncounter}
          onBack={() => setSelectedEncounterId(null)}
          onEdit={() => setIsFormOpen(true)}
        />
      )}

      <EncounterForm
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleCreateEncounter}
        doctors={doctors}
      />
    </main>
  );
}
