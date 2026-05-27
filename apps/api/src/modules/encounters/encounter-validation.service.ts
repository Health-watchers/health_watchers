import { Types } from 'mongoose';
import { PatientModel } from '../patients/models/patient.model';
import { UserModel } from '../auth/models/user.model';
import { ICD10Model } from '../icd10/icd10.model';
import { EncounterModel } from './encounter.model';

export interface ValidationError {
  field: string;
  message: string;
}

const VITAL_SIGN_RANGES = {
  heartRate: { min: 20, max: 300 },
  systolicBP: { min: 50, max: 300 },
  diastolicBP: { min: 20, max: 200 },
  temperature: { min: 30, max: 45 },
  oxygenSaturation: { min: 50, max: 100 },
  weight: { min: 0.5, max: 500 },
  height: { min: 20, max: 300 },
};

export class EncounterValidationService {
  async validateEncounterCreation(
    data: any,
    clinicId: string,
    options: { maxPastHours?: number; allowOpenEncounter?: boolean } = {}
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    const { maxPastHours = 24, allowOpenEncounter = false } = options;

    // Patient validation
    const patientErrors = await this.validatePatient(data.patientId, clinicId, allowOpenEncounter);
    errors.push(...patientErrors);

    // Doctor validation
    const doctorErrors = await this.validateDoctor(data.attendingDoctorId, clinicId);
    errors.push(...doctorErrors);

    // Vital signs validation
    if (data.vitalSigns) {
      const vitalErrors = this.validateVitalSigns(data.vitalSigns);
      errors.push(...vitalErrors);
    }

    // Encounter date validation
    const dateErrors = this.validateEncounterDate(maxPastHours);
    errors.push(...dateErrors);

    // Diagnosis validation
    if (data.diagnosis && data.diagnosis.length > 0) {
      const diagnosisErrors = await this.validateDiagnosis(data.diagnosis);
      errors.push(...diagnosisErrors);
    }

    // Prescription validation
    if (data.prescriptions && data.prescriptions.length > 0) {
      const prescriptionErrors = await this.validatePrescriptions(
        data.prescriptions,
        data.patientId
      );
      errors.push(...prescriptionErrors);
    }

    return errors;
  }

  private async validatePatient(
    patientId: string,
    clinicId: string,
    allowOpenEncounter: boolean
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    const patient = await PatientModel.findById(patientId);
    if (!patient) {
      errors.push({ field: 'patientId', message: 'Patient not found' });
      return errors;
    }

    if (!patient.isActive) {
      errors.push({ field: 'patientId', message: 'Patient is not active' });
    }

    if (patient.clinicId.toString() !== clinicId) {
      errors.push({
        field: 'patientId',
        message: 'Patient does not belong to this clinic',
      });
    }

    if (!allowOpenEncounter) {
      const openEncounter = await EncounterModel.findOne({
        patientId: new Types.ObjectId(patientId),
        status: 'open',
      });
      if (openEncounter) {
        errors.push({
          field: 'patientId',
          message: 'Patient already has an open encounter',
        });
      }
    }

    return errors;
  }

  private async validateDoctor(doctorId: string, clinicId: string): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    const doctor = await UserModel.findById(doctorId);
    if (!doctor) {
      errors.push({ field: 'attendingDoctorId', message: 'Doctor not found' });
      return errors;
    }

    if (!doctor.isActive) {
      errors.push({ field: 'attendingDoctorId', message: 'Doctor is not active' });
    }

    if (doctor.clinicId.toString() !== clinicId) {
      errors.push({
        field: 'attendingDoctorId',
        message: 'Doctor does not belong to this clinic',
      });
    }

    if (!['DOCTOR', 'NURSE'].includes(doctor.role)) {
      errors.push({
        field: 'attendingDoctorId',
        message: 'User must have DOCTOR or NURSE role',
      });
    }

    return errors;
  }

  private validateVitalSigns(vitalSigns: any): ValidationError[] {
    const errors: ValidationError[] = [];

    if (vitalSigns.heartRate !== undefined) {
      if (
        vitalSigns.heartRate < VITAL_SIGN_RANGES.heartRate.min ||
        vitalSigns.heartRate > VITAL_SIGN_RANGES.heartRate.max
      ) {
        errors.push({
          field: 'vitalSigns.heartRate',
          message: `Heart rate must be between ${VITAL_SIGN_RANGES.heartRate.min} and ${VITAL_SIGN_RANGES.heartRate.max} bpm`,
        });
      }
    }

    if (vitalSigns.temperature !== undefined) {
      if (
        vitalSigns.temperature < VITAL_SIGN_RANGES.temperature.min ||
        vitalSigns.temperature > VITAL_SIGN_RANGES.temperature.max
      ) {
        errors.push({
          field: 'vitalSigns.temperature',
          message: `Temperature must be between ${VITAL_SIGN_RANGES.temperature.min} and ${VITAL_SIGN_RANGES.temperature.max}°C`,
        });
      }
    }

    if (vitalSigns.oxygenSaturation !== undefined) {
      if (
        vitalSigns.oxygenSaturation < VITAL_SIGN_RANGES.oxygenSaturation.min ||
        vitalSigns.oxygenSaturation > VITAL_SIGN_RANGES.oxygenSaturation.max
      ) {
        errors.push({
          field: 'vitalSigns.oxygenSaturation',
          message: `Oxygen saturation must be between ${VITAL_SIGN_RANGES.oxygenSaturation.min} and ${VITAL_SIGN_RANGES.oxygenSaturation.max}%`,
        });
      }
    }

    if (vitalSigns.weight !== undefined) {
      if (
        vitalSigns.weight < VITAL_SIGN_RANGES.weight.min ||
        vitalSigns.weight > VITAL_SIGN_RANGES.weight.max
      ) {
        errors.push({
          field: 'vitalSigns.weight',
          message: `Weight must be between ${VITAL_SIGN_RANGES.weight.min} and ${VITAL_SIGN_RANGES.weight.max} kg`,
        });
      }
    }

    if (vitalSigns.height !== undefined) {
      if (
        vitalSigns.height < VITAL_SIGN_RANGES.height.min ||
        vitalSigns.height > VITAL_SIGN_RANGES.height.max
      ) {
        errors.push({
          field: 'vitalSigns.height',
          message: `Height must be between ${VITAL_SIGN_RANGES.height.min} and ${VITAL_SIGN_RANGES.height.max} cm`,
        });
      }
    }

    return errors;
  }

  private validateEncounterDate(maxPastHours: number): ValidationError[] {
    const errors: ValidationError[] = [];
    const now = new Date();

    // Cannot create future encounters
    if (now < new Date()) {
      errors.push({
        field: 'createdAt',
        message: 'Cannot create encounter with future date',
      });
    }

    // Cannot create encounters older than maxPastHours
    const maxPastTime = new Date(now.getTime() - maxPastHours * 60 * 60 * 1000);
    if (now < maxPastTime) {
      errors.push({
        field: 'createdAt',
        message: `Cannot create encounter more than ${maxPastHours} hours in the past`,
      });
    }

    return errors;
  }

  private async validateDiagnosis(diagnoses: any[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    if (diagnoses.length > 10) {
      errors.push({
        field: 'diagnosis',
        message: 'Maximum 10 diagnosis codes allowed per encounter',
      });
      return errors;
    }

    for (let i = 0; i < diagnoses.length; i++) {
      const diagnosis = diagnoses[i];
      const icd10 = await ICD10Model.findOne({ code: diagnosis.code });
      if (!icd10) {
        errors.push({
          field: `diagnosis[${i}].code`,
          message: `ICD-10 code "${diagnosis.code}" not found in database`,
        });
      }
    }

    return errors;
  }

  private async validatePrescriptions(
    prescriptions: any[],
    patientId: string
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    for (let i = 0; i < prescriptions.length; i++) {
      const rx = prescriptions[i];

      if (!rx.drugName) {
        errors.push({
          field: `prescriptions[${i}].drugName`,
          message: 'Drug name is required',
        });
      }

      if (!rx.dosage) {
        errors.push({
          field: `prescriptions[${i}].dosage`,
          message: 'Dosage is required',
        });
      }

      if (!rx.frequency) {
        errors.push({
          field: `prescriptions[${i}].frequency`,
          message: 'Frequency is required',
        });
      }

      // Check allergies if no override
      if (!rx.allergyOverride) {
        const patient = await PatientModel.findById(patientId);
        if (patient?.allergies) {
          const allergyMatch = patient.allergies.find(
            (a: any) => a.medication?.toLowerCase() === rx.drugName?.toLowerCase()
          );
          if (allergyMatch) {
            errors.push({
              field: `prescriptions[${i}].drugName`,
              message: `Patient has documented allergy to ${rx.drugName}`,
            });
          }
        }
      }
    }

    return errors;
  }
}
