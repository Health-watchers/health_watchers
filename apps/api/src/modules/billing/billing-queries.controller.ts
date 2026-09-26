import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { EncounterModel } from '../encounters/encounter.model';
import { InvoiceModel } from '../invoices/invoice.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { buildAgingReport } from './billing-aging';

/** Encounters with no billing codes assigned yet. */
export async function getUnbilledEncounters(req: Request, res: Response) {
  const { clinicId } = req.user!;

  const encounters = await EncounterModel.find({
    clinicId,
    'billing.billingStatus': 'unbilled',
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('patientId', 'firstName lastName systemId')
    .populate('attendingDoctorId', 'fullName')
    .lean();

  return res.json({ success: true, data: encounters });
}

/** Encounters whose claims were denied by the payer. */
export async function getDeniedEncounters(req: Request, res: Response) {
  const { clinicId } = req.user!;

  const encounters = await EncounterModel.find({
    clinicId,
    'billing.billingStatus': 'denied',
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('patientId', 'firstName lastName systemId')
    .populate('attendingDoctorId', 'fullName')
    .lean();

  return res.json({ success: true, data: encounters });
}

/** Aging report: unbilled encounters bucketed by days since service. */
export async function getAgingReport(req: Request, res: Response) {
  const { clinicId } = req.user!;

  const encounters = await EncounterModel.find({
    clinicId,
    'billing.billingStatus': 'unbilled',
  })
    .select('_id patientId createdAt')
    .lean();

  const entries = encounters.map((e) => ({
    encounterId: String(e._id),
    patientId: String(e.patientId),
    serviceDate: (e.createdAt as Date | undefined) ?? new Date(),
  }));

  const report = buildAgingReport(entries);

  return res.json({ success: true, data: report });
}

/**
 * Billing summary report:
 *  - invoices grouped by status with counts and totals
 *  - collected revenue (confirmed payments)
 *  - outstanding balance (invoiced − collected)
 */
export async function getBillingSummary(req: Request, res: Response) {
  const { clinicId } = req.user!;
  const clinicObjectId = new Types.ObjectId(clinicId);

  const [invoiceGroups, invoiceTotals, collectedAgg] = await Promise.all([
    InvoiceModel.aggregate([
      { $match: { clinicId: clinicObjectId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: { $toDouble: '$total' } },
        },
      },
    ]),
    InvoiceModel.aggregate([
      { $match: { clinicId: clinicObjectId } },
      { $group: { _id: null, total: { $sum: { $toDouble: '$total' } } } },
    ]),
    PaymentRecordModel.aggregate([
      { $match: { clinicId, status: 'confirmed' } },
      { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } },
    ]),
  ]);

  const byStatus = invoiceGroups.reduce<Record<string, { count: number; total: number }>>(
    (acc, group) => {
      acc[group._id] = { count: group.count, total: group.total };
      return acc;
    },
    {}
  );

  const totalInvoiced = invoiceTotals[0]?.total ?? 0;
  const totalCollected = collectedAgg[0]?.total ?? 0;
  const outstanding = Math.max(totalInvoiced - totalCollected, 0);

  return res.json({
    success: true,
    data: {
      byStatus,
      totalInvoiced,
      totalCollected,
      outstanding,
      invoiceCount: Object.values(byStatus).reduce((s, g) => s + g.count, 0),
    },
  });
}
