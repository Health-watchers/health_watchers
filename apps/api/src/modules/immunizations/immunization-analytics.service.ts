/**
 * Immunization analytics (Issue #1246)
 *
 * Clinic-level analytics: doses administered (by vaccine and over time),
 * series completion, vaccine coverage against the CDC schedule, adverse
 * event breakdown, compliance, and lot inventory.
 */
import { ImmunizationModel } from './immunization.model';
import { PatientModel } from '../patients/models/patient.model';
import { VaccineLotModel } from './vaccine-lot.model';
import { VaccineAdverseEventModel } from './adverse-event.model';
import { IMMUNIZATION_SCHEDULE } from './immunization-schedule.service';
import { calculateImmunityStatus } from './immunity-status.service';
import { quantityRemaining } from './vaccine-lot.service';

export interface ImmunizationAnalytics {
  period: { from: string; to: string };
  totalDosesAdministered: number;
  dosesByVaccine: Array<{ vaccineCode: string; vaccineName: string; count: number }>;
  dosesOverTime: Array<{ period: string; count: number }>;
  seriesCompletion: { completed: number; incomplete: number; completionRate: number };
  vaccineCoverage: Array<{
    vaccineCode: string;
    vaccineName: string;
    eligible: number;
    protected: number;
    coveragePercent: number;
  }>;
  adverseEvents: { total: number; bySeverity: Record<string, number> };
  compliance: {
    dueCount: number;
    overdueCount: number;
    onTrackCount: number;
    complianceRate: number;
  };
  lotInventory: {
    totalLots: number;
    activeLots: number;
    lowStockLots: number;
    expiredLots: number;
    recalledLots: number;
    dosesOnHand: number;
  };
}

export async function getImmunizationAnalytics(
  clinicId: string,
  from: Date,
  to: Date
): Promise<ImmunizationAnalytics> {
  const dateFilter = { $gte: from, $lte: to } as const;

  const [totalDoses, dosesByVaccineAgg, dosesOverTimeAgg, patients, adverseEvents, lots] =
    await Promise.all([
      ImmunizationModel.countDocuments({
        clinicId,
        administeredDate: dateFilter,
        isActive: true,
      }),
      ImmunizationModel.aggregate([
        { $match: { clinicId, administeredDate: dateFilter, isActive: true } },
        {
          $group: {
            _id: '$vaccineCode',
            vaccineName: { $first: '$vaccineName' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      ImmunizationModel.aggregate([
        { $match: { clinicId, administeredDate: dateFilter, isActive: true } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m', date: '$administeredDate' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      PatientModel.find({ clinicId, isActive: true }).select('_id dateOfBirth').lean(),
      VaccineAdverseEventModel.find({ clinicId, onsetDate: dateFilter }).lean(),
      VaccineLotModel.find({ clinicId }).lean(),
    ]);

  const dosesByVaccine = dosesByVaccineAgg.map((d) => ({
    vaccineCode: String(d._id),
    vaccineName: d.vaccineName as string,
    count: d.count as number,
  }));

  const dosesOverTime = dosesOverTimeAgg.map((d) => ({
    period: String(d._id),
    count: d.count as number,
  }));

  // Series completion + coverage from patient-level immunity status
  const allImmunizations = await ImmunizationModel.find({
    clinicId,
    isActive: true,
  })
    .select('patientId vaccineCode doseNumber administeredDate')
    .lean();

  const dosesByPatient = new Map<
    string,
    Array<{ vaccineCode: string; doseNumber: number; administeredDate: Date }>
  >();
  for (const imm of allImmunizations) {
    const key = String(imm.patientId);
    const list = dosesByPatient.get(key) ?? [];
    list.push({
      vaccineCode: imm.vaccineCode,
      doseNumber: imm.doseNumber,
      administeredDate: imm.administeredDate as Date,
    });
    dosesByPatient.set(key, list);
  }

  let completed = 0;
  let incomplete = 0;
  let dueCount = 0;
  let overdueCount = 0;
  const coverageMap = new Map<
    string,
    { vaccineCode: string; vaccineName: string; eligible: number; protected: number }
  >();

  for (const patient of patients) {
    const dob = patient.dateOfBirth as string | undefined;
    if (!dob) continue;

    const statuses = calculateImmunityStatus(dob, dosesByPatient.get(String(patient._id)) ?? []);

    const applicable = statuses.filter(
      (s) => s.status !== 'not_eligible' && s.status !== 'unknown'
    );

    const hasOverdue = applicable.some((s) => s.status === 'overdue');
    const hasDue = applicable.some((s) => s.status === 'due');
    const hasNotStarted = applicable.some((s) => s.status === 'not_started');
    if (hasOverdue) overdueCount += 1;
    if (hasDue) dueCount += 1;

    for (const s of applicable) {
      const entry = coverageMap.get(s.vaccineCode) ?? {
        vaccineCode: s.vaccineCode,
        vaccineName: s.vaccineName,
        eligible: 0,
        protected: 0,
      };
      entry.eligible += 1;
      if (s.seriesComplete) entry.protected += 1;
      coverageMap.set(s.vaccineCode, entry);
    }

    // A patient is counted as fully on-track when none of their applicable
    // vaccine series are due, overdue, or unstarted.
    if (applicable.length === 0) continue;
    if (hasOverdue || hasDue || hasNotStarted) incomplete += 1;
    else completed += 1;
  }

  const vaccineCoverage = Array.from(coverageMap.values())
    .map((c) => ({
      ...c,
      coveragePercent: c.eligible > 0 ? Math.round((c.protected / c.eligible) * 10000) / 100 : 0,
    }))
    .sort((a, b) => a.vaccineName.localeCompare(b.vaccineName));

  const adverseBySeverity = adverseEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.severity] = (acc[e.severity] ?? 0) + 1;
    return acc;
  }, {});

  const complianceRate =
    patients.length > 0
      ? Math.round(((patients.length - (dueCount + overdueCount)) / patients.length) * 100)
      : 0;

  const lotInventory = lots.reduce(
    (acc, lot) => {
      acc.totalLots += 1;
      const remaining = quantityRemaining(lot);
      // Recalled/expired doses are not usable, so exclude them from on-hand stock.
      if (lot.status !== 'recalled' && lot.status !== 'expired') {
        acc.dosesOnHand += Math.max(remaining, 0);
      }
      switch (lot.status) {
        case 'active':
          acc.activeLots += 1;
          break;
        case 'low':
          acc.lowStockLots += 1;
          break;
        case 'expired':
          acc.expiredLots += 1;
          break;
        case 'recalled':
          acc.recalledLots += 1;
          break;
        default:
          break;
      }
      return acc;
    },
    {
      totalLots: 0,
      activeLots: 0,
      lowStockLots: 0,
      expiredLots: 0,
      recalledLots: 0,
      dosesOnHand: 0,
    }
  );

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totalDosesAdministered: totalDoses,
    dosesByVaccine,
    dosesOverTime,
    seriesCompletion: {
      completed,
      incomplete,
      completionRate:
        completed + incomplete > 0
          ? Math.round((completed / (completed + incomplete)) * 10000) / 100
          : 0,
    },
    vaccineCoverage,
    adverseEvents: { total: adverseEvents.length, bySeverity: adverseBySeverity },
    compliance: {
      dueCount,
      overdueCount,
      onTrackCount: patients.length - (dueCount + overdueCount),
      complianceRate,
    },
    lotInventory,
  };
}

export { IMMUNIZATION_SCHEDULE };
