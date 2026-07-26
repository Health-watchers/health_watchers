import { ImmunizationModel } from './immunization.model';
import { PatientModel } from '../patients/models/patient.model';
import { NotificationModel } from '../notifications/notification.model';
import { Types } from 'mongoose';
import logger from '@api/utils/logger';

/**
 * Immunization compliance schedule based on CDC guidelines
 * Maps vaccine code to recommended ages (in months)
 */
const IMMUNIZATION_SCHEDULE: Record<string, number[]> = {
  '20': [2, 4, 6, 15, 18, 4], // DTaP: 2, 4, 6, 15-18 months, 4-6 years
  '03': [12, 4], // MMR: 12-15 months, 4-6 years
  '21': [12, 4], // Varicella: 12-15 months, 4-6 years
  '08': [0, 1, 6], // Hepatitis B: birth, 1-2 months, 6 months
  '10': [2, 4, 6, 18], // IPV: 2, 4, 6, 18 months
  '17': [2, 4, 6, 12], // Hib: 2, 4, 6, 12-15 months
  '88': [6, 12], // Influenza: 6 months annually
  '33': [65], // Pneumococcal PPV23: 65+ years
  '100': [2, 4, 6, 12], // PCV7: 2, 4, 6, 12-15 months
  '133': [2, 4, 6, 12], // PCV13: 2, 4, 6, 12-15 months
};

export interface OverdueImmunization {
  patientId: string;
  patientName: string;
  vaccineName: string;
  vaccineCode: string;
  dueDate: Date;
  daysOverdue: number;
  attendingDoctorId: string;
}

export class ImmunizationComplianceService {
  /**
   * Calculate patient age in months
   */
  private getAgeInMonths(birthDate: Date): number {
    const now = new Date();
    const months =
      (now.getFullYear() - birthDate.getFullYear()) * 12 + (now.getMonth() - birthDate.getMonth());
    return Math.max(0, months);
  }

  /**
   * Check if a patient is overdue for a vaccine
   */
  private isOverdue(
    lastAdministeredDate: Date | null,
    ageInMonths: number,
    vaccineCode: string
  ): boolean {
    const schedule = IMMUNIZATION_SCHEDULE[vaccineCode];
    if (!schedule || schedule.length === 0) return false;

    // Find the next due age
    const nextDueAge = schedule.find((age) => age > ageInMonths);
    if (!nextDueAge) return false; // All doses completed

    // If vaccine was never given, check if patient is past the first recommended age
    if (!lastAdministeredDate) {
      return ageInMonths >= nextDueAge;
    }

    // Check if patient is overdue (more than 1 month past due date)
    const dueDate = new Date(lastAdministeredDate);
    dueDate.setMonth(dueDate.getMonth() + 1); // Add 1 month grace period
    return new Date() > dueDate;
  }

  /**
   * Find all overdue immunizations for a patient
   */
  async findOverdueForPatient(patientId: string): Promise<OverdueImmunization[]> {
    const patient = await PatientModel.findById(patientId).lean();
    if (!patient || !patient.dateOfBirth) return [];

    const ageInMonths = this.getAgeInMonths(new Date(patient.dateOfBirth));
    const overdue: OverdueImmunization[] = [];

    // Check each vaccine in the schedule
    for (const [vaccineCode, ages] of Object.entries(IMMUNIZATION_SCHEDULE)) {
      const lastImmunization = await ImmunizationModel.findOne({
        patientId,
        vaccineCode,
      })
        .sort({ administeredDate: -1 })
        .lean();

      const nextDueAge = ages.find((age) => age > ageInMonths);
      if (!nextDueAge) continue; // All doses completed

      const lastDate = lastImmunization?.administeredDate || null;
      if (this.isOverdue(lastDate, ageInMonths, vaccineCode)) {
        const dueDate = lastDate ? new Date(lastDate) : new Date(patient.dateOfBirth);
        dueDate.setMonth(dueDate.getMonth() + nextDueAge);

        const daysOverdue = Math.floor(
          (new Date().getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        overdue.push({
          patientId,
          patientName: `${patient.firstName} ${patient.lastName}`,
          vaccineName: lastImmunization?.vaccineName || `Vaccine ${vaccineCode}`,
          vaccineCode,
          dueDate,
          daysOverdue: Math.max(0, daysOverdue),
          attendingDoctorId: (patient as any).attendingDoctorId?.toString() || '',
        });
      }
    }

    return overdue;
  }

  /**
   * Run daily compliance job to identify overdue patients
   */
  async runDailyComplianceJob(clinicId: string): Promise<void> {
    try {
      const patients = await PatientModel.find({ clinicId, isActive: true }).lean();

      for (const patient of patients) {
        const overdueImmunizations = await this.findOverdueForPatient(patient._id.toString());

        for (const overdue of overdueImmunizations) {
          // Create notification for attending doctor
          if (overdue.attendingDoctorId) {
            await NotificationModel.create({
              userId: new Types.ObjectId(overdue.attendingDoctorId),
              clinicId: new Types.ObjectId(clinicId),
              type: 'IMMUNIZATION_OVERDUE',
              title: `Immunization Overdue: ${overdue.patientName}`,
              message: `${overdue.vaccineName} is ${overdue.daysOverdue} days overdue for ${overdue.patientName}`,
              metadata: {
                patientId: overdue.patientId,
                vaccineCode: overdue.vaccineCode,
                daysOverdue: overdue.daysOverdue,
              },
              read: false,
              createdAt: new Date(),
            });
          }
        }
      }

      logger.info({ clinicId }, 'Immunization compliance job completed');
    } catch (err) {
      logger.error({ err, clinicId }, 'Immunization compliance job failed');
    }
  }
}

export const immunizationComplianceService = new ImmunizationComplianceService();
