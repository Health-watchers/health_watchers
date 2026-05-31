import { Request, Response } from 'express';
import { validateUploadedFile } from './document-validation';
import { PortalDocumentModel } from './portal-document.model';

export async function uploadDocument(req: Request, res: Response) {
  const { patientId, clinicId } = req.user as any;
  const file = (req as any).file;

  if (!file) return res.status(400).json({ success: false, message: 'No file provided.' });

  const validation = validateUploadedFile(file.mimetype, file.size, file.originalname);
  if (!validation.valid) return res.status(400).json({ success: false, message: validation.reason });

  const { category = 'other', visibility = 'care_team' } = req.body;

  const doc = await PortalDocumentModel.create({
    patientId, clinicId,
    fileName:   file.originalname,
    mimeType:   file.mimetype,
    sizeBytes:  file.size,
    category, visibility,
    storageKey: `portal/${patientId}/${Date.now()}_${file.originalname}`,
    uploadedAt: new Date(),
  });

  // TODO: emit notification to care team
  return res.status(201).json({ success: true, data: doc });
}

export async function listMyDocuments(req: Request, res: Response) {
  const { patientId } = req.user as any;
  const { category, limit = 50 } = req.query;

  const filter: any = { patientId, deletedAt: { $exists: false } };
  if (category) filter.category = category;

  const docs = await PortalDocumentModel.find(filter)
    .sort({ uploadedAt: -1 })
    .limit(Number(limit))
    .select('-storageKey');

  return res.json({ success: true, data: docs });
}
