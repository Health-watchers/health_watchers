import { Request, Response } from 'express';
import { buildAgingReport } from './billing-aging';

export async function getUnbilledEncounters(req: Request, res: Response) {
  // TODO: await EncounterModel.find({ 'billing.billingStatus': 'unbilled' })
  return res.json({ success: true, data: [] });
}

export async function getDeniedEncounters(req: Request, res: Response) {
  // TODO: await EncounterModel.find({ 'billing.billingStatus': 'denied' })
  return res.json({ success: true, data: [] });
}

export async function getAgingReport(req: Request, res: Response) {
  const report = buildAgingReport([]);
  return res.json({ success: true, data: report });
}
