import { Request, Response } from 'express';
import { EncounterModel } from './encounter.model';
import { encounterLazyLoadService } from './encounter-lazy-load.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { z } from 'zod';

const getEncounterRelationSchema = z.object({
  encounterId: z.string().min(1),
  relation: z.enum([
    'attendingDoctor',
    'patient',
    'clinic',
    'appointment',
    'encounteredBy',
    'templateVersion',
    'followUpEncounter',
    'prescribingDoctors',
    'attachmentUploaders',
  ]),
});

export const getEncounterRelation = asyncHandler(async (req: Request, res: Response) => {
  const { encounterId, relation } = getEncounterRelationSchema.parse({
    encounterId: req.params.encounterId,
    relation: req.params.relation,
  });

  const encounter = await EncounterModel.findById(encounterId).select(
    `${relation} ${relation}Id prescriptions.prescribedBy attachments.uploadedBy`
  );

  if (!encounter) {
    return res.status(404).json({ error: 'Encounter not found' });
  }

  let result;

  switch (relation) {
    case 'attendingDoctor':
      result = await encounterLazyLoadService.loadAttendingDoctor(
        encounterId,
        (encounter.attendingDoctorId as any).toString()
      );
      break;

    case 'patient':
      result = await encounterLazyLoadService.loadPatient(
        encounterId,
        (encounter.patientId as any).toString()
      );
      break;

    case 'clinic':
      result = await encounterLazyLoadService.loadClinic(
        encounterId,
        (encounter.clinicId as any).toString()
      );
      break;

    case 'appointment':
      if (encounter.appointmentId) {
        result = await encounterLazyLoadService.loadAppointment(
          encounterId,
          (encounter.appointmentId as any).toString()
        );
      }
      break;

    case 'encounteredBy':
      if (encounter.encounteredBy) {
        result = await encounterLazyLoadService.loadEncounteredBy(
          encounterId,
          (encounter.encounteredBy as any).toString()
        );
      }
      break;

    case 'templateVersion':
      if (encounter.templateVersionId) {
        result = await encounterLazyLoadService.loadTemplateVersion(
          encounterId,
          (encounter.templateVersionId as any).toString()
        );
      }
      break;

    case 'followUpEncounter':
      if (encounter.followUpEncounterId) {
        result = await encounterLazyLoadService.loadFollowUpEncounter(
          encounterId,
          (encounter.followUpEncounterId as any).toString()
        );
      }
      break;

    case 'prescribingDoctors':
      if (encounter.prescriptions && encounter.prescriptions.length > 0) {
        const doctorIds = encounter.prescriptions.map((p) => (p.prescribedBy as any).toString());
        result = await encounterLazyLoadService.loadPrescribingDoctors(encounterId, [
          ...new Set(doctorIds),
        ]);
      }
      break;

    case 'attachmentUploaders':
      if (encounter.attachments && encounter.attachments.length > 0) {
        const uploaderIds = encounter.attachments.map((a) => (a.uploadedBy as any).toString());
        result = await encounterLazyLoadService.loadAttachmentUploaders(encounterId, [
          ...new Set(uploaderIds),
        ]);
      }
      break;

    default:
      return res.status(400).json({ error: 'Invalid relation' });
  }

  return res.status(200).json({
    relation,
    data: result || null,
    loadedAt: new Date(),
  });
});

export const getMultipleEncounterRelations = asyncHandler(async (req: Request, res: Response) => {
  const { encounterId } = z.object({ encounterId: z.string().min(1) }).parse({
    encounterId: req.params.encounterId,
  });

  const relations = (req.query.relations as string)?.split(',') || [];

  const encounter = await EncounterModel.findById(encounterId);

  if (!encounter) {
    return res.status(404).json({ error: 'Encounter not found' });
  }

  const results: Record<string, any> = {};

  for (const relation of relations) {
    try {
      switch (relation) {
        case 'attendingDoctor':
          results.attendingDoctor = await encounterLazyLoadService.loadAttendingDoctor(
            encounterId,
            (encounter.attendingDoctorId as any).toString()
          );
          break;
        case 'patient':
          results.patient = await encounterLazyLoadService.loadPatient(
            encounterId,
            (encounter.patientId as any).toString()
          );
          break;
        case 'clinic':
          results.clinic = await encounterLazyLoadService.loadClinic(
            encounterId,
            (encounter.clinicId as any).toString()
          );
          break;
        case 'appointment':
          if (encounter.appointmentId) {
            results.appointment = await encounterLazyLoadService.loadAppointment(
              encounterId,
              (encounter.appointmentId as any).toString()
            );
          }
          break;
      }
    } catch (error) {
      results[relation] = { error: 'Failed to load relation' };
    }
  }

  return res.status(200).json({
    encounterId,
    relations: results,
    loadedAt: new Date(),
  });
});
