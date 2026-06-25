import { Request, Response } from 'express';
import { PatientHealthLogModel } from './health-log.model';

// POST /api/v1/portal/health-log
export async function logHealthMetric(req: Request, res: Response) {
  try {
    const { patientId } = req.user as any;
    const { metricType, value, unit, loggedAt, notes } = req.body;
    const log = await PatientHealthLogModel.create({
      patientId,
      metricType,
      value,
      unit,
      loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
      notes,
    });
    return res.status(201).json({ success: true, data: log });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

// GET /api/v1/portal/health-log
export async function getMyHealthLog(req: Request, res: Response) {
  const { patientId } = req.user as any;
  const { metricType, limit = 50 } = req.query;
  const filter: any = { patientId };
  if (metricType) filter.metricType = metricType;
  const logs = await PatientHealthLogModel.find(filter)
    .sort({ loggedAt: -1 })
    .limit(Number(limit));
  return res.json({ success: true, data: logs });
}

// GET /api/v1/patients/:id/health-log
export async function getPatientHealthLog(req: Request, res: Response) {
  const { id } = req.params;
  const { metricType, limit = 100 } = req.query;
  const filter: any = { patientId: id };
  if (metricType) filter.metricType = metricType;
  const logs = await PatientHealthLogModel.find(filter)
    .sort({ loggedAt: -1 })
    .limit(Number(limit));
  return res.json({ success: true, data: logs });
}
