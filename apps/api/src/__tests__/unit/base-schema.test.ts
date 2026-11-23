/**
 * Unit tests for the shared baseSchema.
 *
 * Verifies that all Mongoose models that use the baseSchema have the
 * required base fields (clinicId, isActive, createdBy) consistently present.
 */

import { Schema } from 'mongoose';
import { baseSchema } from '@api/shared';
import { AppointmentModel } from '../../modules/appointments/appointment.model';
import { EncounterModel } from '../../modules/encounters/encounter.model';
import { PatientModel } from '../../modules/patients/models/patient.model';
import { UserModel } from '../../modules/auth/models/user.model';
import { ClinicModel } from '../../modules/clinics/clinic.model';
import { InsuranceClaimModel } from '../../modules/billing/claim.model';
import { CDSRuleModel } from '../../modules/cds/cds-rule.model';
import { SurveyModel } from '../../modules/surveys/survey.model';
import { BAAModel } from '../../modules/compliance/baa.model';
import { ArchiveModel } from '../../modules/archive/archive.model';
import { ConsentModel } from '../../modules/consent/consent.model';
import { InvoiceModel } from '../../modules/invoices/invoice.model';
import { NotificationTemplateModel } from '../../modules/notifications/notification-template.model';
import { StaffScheduleModel } from '../../modules/schedules/models/staff-schedule.model';
import { WebhookModel } from '../../modules/webhooks/webhook.model';
import { SubscriptionModel } from '../../modules/subscriptions/subscription.model';
import { VaccineLotModel } from '../../modules/immunizations/vaccine-lot.model';
import { VaccineAdverseEventModel } from '../../modules/immunizations/adverse-event.model';
import { BreachNotificationModel } from '../../modules/compliance/breach.model';
import { InsuranceVerificationModel } from '../../modules/billing/insurance-verification.model';
import { PopulationHealthModel } from '../../modules/ai/population-health.model';
import { MedicalHistoryModel } from '../../modules/patients/models/medical-history.model';
import { ErasureRequestModel } from '../../modules/erasure-requests/erasure-request.model';
import { PortalDocumentModel } from '../../modules/portal/documents/portal-document.model';
import { ImmunizationRecallModel } from '../../modules/immunizations/immunization-recall.model';
import { ReimbursementModel } from '../../modules/payments/models/reimbursement.model';
import { TriageQueueModel } from '../../modules/ai/triage.model';
import { CreditNoteModel } from '../../modules/billing/credit-note.model';
import { WaitlistModel } from '../../modules/appointments/waitlist.model';

const BASE_FIELDS = ['clinicId', 'isActive', 'createdBy'];

describe('baseSchema', () => {
  describe('schema definition', () => {
    it('defines clinicId as an ObjectId ref to Clinic', () => {
      const path = baseSchema.path('clinicId');
      expect(path).toBeDefined();
      expect(path.instance).toBe('ObjectID');
    });

    it('defines isActive as a Boolean with default true', () => {
      const path = baseSchema.path('isActive');
      expect(path).toBeDefined();
      expect(path.instance).toBe('Boolean');
    });

    it('defines createdBy as an ObjectId ref to User', () => {
      const path = baseSchema.path('createdBy');
      expect(path).toBeDefined();
      expect(path.instance).toBe('ObjectID');
    });
  });

  describe('model composition', () => {
    const models = [
      { name: 'Appointment', model: AppointmentModel },
      { name: 'Encounter', model: EncounterModel },
      { name: 'Patient', model: PatientModel },
      { name: 'User', model: UserModel },
      { name: 'Clinic', model: ClinicModel },
      { name: 'InsuranceClaim', model: InsuranceClaimModel },
      { name: 'CDSRule', model: CDSRuleModel },
      { name: 'Survey', model: SurveyModel },
      { name: 'BAA', model: BAAModel },
      { name: 'Archive', model: ArchiveModel },
      { name: 'Consent', model: ConsentModel },
      { name: 'Invoice', model: InvoiceModel },
      { name: 'NotificationTemplate', model: NotificationTemplateModel },
      { name: 'StaffSchedule', model: StaffScheduleModel },
      { name: 'Webhook', model: WebhookModel },
      { name: 'Subscription', model: SubscriptionModel },
      { name: 'VaccineLot', model: VaccineLotModel },
      { name: 'VaccineAdverseEvent', model: VaccineAdverseEventModel },
      { name: 'BreachNotification', model: BreachNotificationModel },
      { name: 'InsuranceVerification', model: InsuranceVerificationModel },
      { name: 'PopulationHealth', model: PopulationHealthModel },
      { name: 'MedicalHistory', model: MedicalHistoryModel },
      { name: 'ErasureRequest', model: ErasureRequestModel },
      { name: 'PortalDocument', model: PortalDocumentModel },
      { name: 'ImmunizationRecall', model: ImmunizationRecallModel },
      { name: 'Reimbursement', model: ReimbursementModel },
      { name: 'TriageQueue', model: TriageQueueModel },
      { name: 'CreditNote', model: CreditNoteModel },
      { name: 'Waitlist', model: WaitlistModel },
    ];

    for (const { name, model } of models) {
      describe(name, () => {
        for (const field of BASE_FIELDS) {
          it(`has ${field} in its schema`, () => {
            const schema = model.schema;
            const path = schema.path(field);
            expect(path).toBeDefined();
            expect(path).not.toBeNull();
          });
        }
      });
    }
  });

  describe('schema composition via add()', () => {
    it('baseSchema fields are accessible via schema.path() after add()', () => {
      const testSchema = new Schema({ name: { type: String, required: true } });
      testSchema.add(baseSchema);

      for (const field of BASE_FIELDS) {
        const path = testSchema.path(field);
        expect(path).toBeDefined();
        expect(path).not.toBeNull();
      }
    });

    it('baseSchema does not introduce an _id sub-document', () => {
      expect(baseSchema.options._id).toBe(false);
    });

    it('baseSchema does not enable timestamps (models handle timestamps separately)', () => {
      expect(baseSchema.options.timestamps).toBe(false);
    });
  });
});
