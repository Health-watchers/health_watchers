"use client";

import { useMemo, useState } from "react";

export type EncounterStatus = "active" | "completed" | "cancelled";

export interface EncounterRecord {
  id: string;
  patientName: string;
  patientMrn: string;
  doctor: string;
  status: EncounterStatus;
  encounterAt: string;
  chiefComplaint: string;
  diagnosis: string[];
  treatmentPlan: string;
  prescriptions: { name: string; dose: string; frequency: string }[];
  vitals: {
    bloodPressure: string;
    heartRate: string;
    temperature: string;
    spo2: string;
  };
  aiSummary?: string;
  followUpDate?: string;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

export const MOCK_ENCOUNTERS: EncounterRecord[] = [
  {
    id: "EN-2026-00091",
    patientName: "Sarah Jenkins",
    patientMrn: "882-991",
    doctor: "Dr. Julian Smith",
    status: "active",
    encounterAt: new Date(Date.now() - ONE_DAY * 0).toISOString(),
    chiefComplaint: "Persistent cough and fatigue",
    diagnosis: ["Upper Respiratory Tract Infection"],
    treatmentPlan:
      "Hydration, rest, and symptomatic treatment. Reassess in 7 days if cough persists.",
    prescriptions: [
      { name: "Acetaminophen", dose: "500mg", frequency: "TID (as needed)" },
    ],
    vitals: {
      bloodPressure: "118/76",
      heartRate: "72",
      temperature: "98.6",
      spo2: "99",
    },
    aiSummary:
      "Patient with recurrent respiratory symptoms over three visits. Pattern suggests unresolved inflammation; consider chest imaging if no improvement in one week.",
    followUpDate: new Date(Date.now() + ONE_DAY * 7).toISOString(),
  },
  {
    id: "EN-2026-00090",
    patientName: "Michael Chen",
    patientMrn: "712-445",
    doctor: "Dr. Julian Smith",
    status: "completed",
    encounterAt: new Date(Date.now() - ONE_DAY * 2).toISOString(),
    chiefComplaint: "Post-op follow-up",
    diagnosis: ["Post-operative recovery - stable"],
    treatmentPlan:
      "Continue wound care protocol and resume light activity as tolerated.",
    prescriptions: [{ name: "Ibuprofen", dose: "400mg", frequency: "BID" }],
    vitals: {
      bloodPressure: "122/80",
      heartRate: "70",
      temperature: "98.4",
      spo2: "98",
    },
    followUpDate: new Date(Date.now() + ONE_DAY * 14).toISOString(),
  },
  {
    id: "EN-2026-00089",
    patientName: "Elena Rodriguez",
    patientMrn: "901-223",
    doctor: "Dr. Elena Varga",
    status: "active",
    encounterAt: new Date(Date.now() - ONE_DAY * 5).toISOString(),
    chiefComplaint: "Chronic lower back pain",
    diagnosis: ["Chronic lumbar strain"],
    treatmentPlan: "Start physical therapy and reduce prolonged sitting.",
    prescriptions: [
      { name: "Naproxen", dose: "250mg", frequency: "BID with meals" },
    ],
    vitals: {
      bloodPressure: "126/82",
      heartRate: "74",
      temperature: "98.7",
      spo2: "98",
    },
  },
  {
    id: "EN-2026-00088",
    patientName: "Lisa Park",
    patientMrn: "331-778",
    doctor: "Dr. Elena Varga",
    status: "cancelled",
    encounterAt: new Date(Date.now() - ONE_DAY * 10).toISOString(),
    chiefComplaint: "Migraine with aura",
    diagnosis: ["Migraine disorder"],
    treatmentPlan:
      "Reschedule neurology consultation and maintain headache diary.",
    prescriptions: [
      { name: "Sumatriptan", dose: "50mg", frequency: "At onset of migraine" },
    ],
    vitals: {
      bloodPressure: "116/74",
      heartRate: "68",
      temperature: "98.3",
      spo2: "99",
    },
  },
];

const DATE_FILTERS = [
  { value: "all", label: "All Time" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "last90", label: "Last 90 Days" },
] as const;

type DateFilterValue = (typeof DATE_FILTERS)[number]["value"];

const STATUS_FILTERS: Array<{ value: "all" | EncounterStatus; label: string }> =
  [
    { value: "all", label: "All Status" },
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ];

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function StatusBadge({ status }: { status: EncounterStatus }) {
  const cls =
    status === "active"
      ? "bg-blue-50 text-blue-700 border-blue-100"
      : status === "completed"
        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
        : "bg-red-50 text-red-700 border-red-100";

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${cls}`}
    >
      {status}
    </span>
  );
}

interface EncounterTableProps {
  encounters: EncounterRecord[];
  onViewDetail: (encounterId: string) => void;
  onNewEncounter: () => void;
}

export default function EncounterTable({
  encounters,
  onViewDetail,
  onNewEncounter,
}: EncounterTableProps) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterValue>("last30");
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EncounterStatus>(
    "all",
  );

  const doctors = useMemo(() => {
    const values = Array.from(new Set(encounters.map((item) => item.doctor)));
    return ["all", ...values];
  }, [encounters]);

  const filteredRows = useMemo(() => {
    const now = Date.now();
    const searchTerm = search.trim().toLowerCase();

    return encounters.filter((item) => {
      const encounterTime = new Date(item.encounterAt).getTime();

      const matchesDate =
        dateFilter === "all" ||
        (dateFilter === "last7" && now - encounterTime <= ONE_DAY * 7) ||
        (dateFilter === "last30" && now - encounterTime <= ONE_DAY * 30) ||
        (dateFilter === "last90" && now - encounterTime <= ONE_DAY * 90);

      const matchesDoctor =
        doctorFilter === "all" || item.doctor === doctorFilter;
      const matchesStatus =
        statusFilter === "all" || item.status === statusFilter;
      const matchesSearch =
        searchTerm.length === 0 ||
        item.patientName.toLowerCase().includes(searchTerm) ||
        item.patientMrn.toLowerCase().includes(searchTerm) ||
        item.chiefComplaint.toLowerCase().includes(searchTerm);

      return matchesDate && matchesDoctor && matchesStatus && matchesSearch;
    });
  }, [encounters, search, dateFilter, doctorFilter, statusFilter]);

  return (
    <section className="rounded-xl bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Encounter List
          </h2>
          <p className="text-sm text-gray-500">
            Review and manage clinical encounters
          </p>
        </div>
        <button
          onClick={onNewEncounter}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          Log Encounter
        </button>
      </div>

      <div className="grid gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 md:grid-cols-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patient, MRN, complaint"
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400"
        />

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilterValue)}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400"
        >
          {DATE_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          value={doctorFilter}
          onChange={(e) => setDoctorFilter(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400"
        >
          {doctors.map((doctor) => (
            <option key={doctor} value={doctor}>
              {doctor === "all" ? "All Doctors" : doctor}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as "all" | EncounterStatus)
          }
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400"
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-100">
        <table className="hidden min-w-full divide-y divide-gray-100 md:table">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Encounter ID</th>
              <th className="px-4 py-3">Patient</th>
              <th className="px-4 py-3">Doctor</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white text-sm">
            {filteredRows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-gray-500" colSpan={6}>
                  No encounters match current filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((item) => (
                <tr key={item.id} className="hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {item.id}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {item.patientName}
                    </div>
                    <div className="text-xs text-gray-500">
                      MRN {item.patientMrn}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{item.doctor}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {formatDateTime(item.encounterAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onViewDetail(item.id)}
                      className="text-sm font-medium text-blue-700 hover:text-blue-800"
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="divide-y divide-gray-100 md:hidden">
          {filteredRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">
              No encounters match current filters.
            </p>
          ) : (
            filteredRows.map((item) => (
              <div key={item.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {item.patientName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.id} · MRN {item.patientMrn}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <p className="text-sm text-gray-600">{item.chiefComplaint}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatDateTime(item.encounterAt)}</span>
                  <button
                    onClick={() => onViewDetail(item.id)}
                    className="font-medium text-blue-700 hover:text-blue-800"
                  >
                    View details
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
