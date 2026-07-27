import { lazyLoader, type LazyLoadOptions, type LazyLoadField } from '../../utils/lazy-loader';
import { UserModel } from '../users/user.model';
import { PatientModel } from '../patients/patient.model';
import { ClinicModel } from '../clinics/clinic.model';
import { AppointmentModel } from '../appointments/appointment.model';
import { EncounterTemplateModel } from './encounter-template.model';

const LAZY_LOAD_FIELDS: LazyLoadField[] = [
  {
    path: 'attendingDoctorId',
    model: 'User',
    select: 'name email specialization',
  },
  {
    path: 'patientId',
    model: 'Patient',
    select: 'firstName lastName email dateOfBirth',
  },
  {
    path: 'clinicId',
    model: 'Clinic',
    select: 'name address phone',
  },
  {
    path: 'appointmentId',
    model: 'Appointment',
    select: 'status scheduledAt',
  },
  {
    path: 'encounteredBy',
    model: 'User',
    select: 'name email role',
  },
  {
    path: 'templateVersionId',
    model: 'EncounterTemplate',
    select: 'name version',
  },
  {
    path: 'prescriptions.prescribedBy',
    model: 'User',
    select: 'name email specialization',
  },
  {
    path: 'coSignedBy',
    model: 'User',
    select: 'name email',
  },
  {
    path: 'followUpEncounterId',
    model: 'Encounter',
    select: 'chiefComplaint status',
  },
  {
    path: 'attachments.uploadedBy',
    model: 'User',
    select: 'name email',
  },
];

export class EncounterLazyLoadService {
  constructor() {
    lazyLoader.registerLazyFields('Encounter', LAZY_LOAD_FIELDS);
  }

  getBaseProjection(options?: LazyLoadOptions) {
    return lazyLoader.getBaseProjection('Encounter', options);
  }

  getLazyFields() {
    return LAZY_LOAD_FIELDS;
  }

  async loadAttendingDoctor(encounterId: string, docId: string) {
    return await UserModel.findById(docId).select('name email specialization').lean();
  }

  async loadPatient(encounterId: string, patientId: string) {
    return await PatientModel.findById(patientId)
      .select('firstName lastName email dateOfBirth')
      .lean();
  }

  async loadClinic(encounterId: string, clinicId: string) {
    return await ClinicModel.findById(clinicId).select('name address phone').lean();
  }

  async loadAppointment(encounterId: string, appointmentId: string) {
    return await AppointmentModel.findById(appointmentId)
      .select('status scheduledAt')
      .lean();
  }

  async loadEncounteredBy(encounterId: string, userId: string) {
    return await UserModel.findById(userId).select('name email role').lean();
  }

  async loadTemplateVersion(encounterId: string, templateId: string) {
    return await EncounterTemplateModel.findById(templateId)
      .select('name version')
      .lean();
  }

  async loadFollowUpEncounter(encounterId: string, followUpId: string) {
    const { EncounterModel } = await import('./encounter.model');
    return await EncounterModel.findById(followUpId)
      .select('chiefComplaint status')
      .lean();
  }

  async loadPrescribingDoctors(encounterId: string, doctorIds: string[]) {
    return await UserModel.find({ _id: { $in: doctorIds } })
      .select('name email specialization')
      .lean();
  }

  async loadAttachmentUploaders(encounterId: string, uploaderIds: string[]) {
    return await UserModel.find({ _id: { $in: uploaderIds } })
      .select('name email')
      .lean();
  }
}

export const encounterLazyLoadService = new EncounterLazyLoadService();
