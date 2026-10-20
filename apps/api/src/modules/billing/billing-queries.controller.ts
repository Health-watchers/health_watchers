import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { EncounterModel } from '../encounters/encounter.model';
import { InvoiceModel } from '../invoices/invoice.model';
import { PaymentRecordModel } from '../payments/models/payment-record.model';
import { buildAgingReport } from './billing-aging';
import { paginate, parsePagination } from '@api/utils/paginate';

const BILLING_SORT_FIELDS: Record<string, Record<string, 1 | -1>> = {
  date_asc: { 'billing.billedAt': 1, createdAt: 1 },
  date_desc: { 'billing.billedAt': -1, createdAt: -1 },
  amount_asc: { 'billing.totalFee': 1, createdAt: -1 },
  amount_desc: { 'billing.totalFee': -1, createdAt: -1 },
};
const DEFAULT_SORT = BILLING_SORT_FIELDS.date_desc;

/** Encounters with no billing codes assigned yet — paginated + sortable. */
export async function getUnbilledEncounters(req: Request, res: Response) {
  const { clinicId } = req.user!;

  const pagination = parsePagination(req.query as Record<string, unknown>);
  if (!pagination) {
    return res.status(400).json({ success: false, message: 'Invalid pagination: limit must be 1–100' });
  }
  const sortKey = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'date_desc';
  const sort = BILLING_SORT_FIELDS[sortKey] ?? DEFAULT_SORT;

  const { data: encounters, meta } = await paginate(
    EncounterModel as any,
    { clinicId, 'billing.billingStatus': 'unbilled' },
    pagination.page,
    pagination.limit,
    sort,
    { hint: 'clinicId_1_billingStatus_1_date_1' }
  );

  // Populate patient and doctor info
  await EncounterModel.populate(encounters, [
    { path: 'patientId', select: 'firstName lastName systemId' },
    { path: 'attendingDoctorId', select: 'fullName' },
  ]);

  return res.json({ success: true, data: encounters, meta });
}

/** Encounters whose claims were denied by the payer — paginated + sortable. */
export async function getDeniedEncounters(req: Request, res: Response) {
  const { clinicId } = req.user!;

  const pagination = parsePagination(req.query as Record<string, unknown>);
  if (!pagination) {
    return res.status(400).json({ success: false, message: 'Invalid pagination: limit must be 1–100' });
  }
  const sortKey = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'date_desc';
  const sort = BILLING_SORT_FIELDS[sortKey] ?? DEFAULT_SORT;

  const { data: encounters, meta } = await paginate(
    EncounterModel as any,
    { clinicId, 'billing.billingStatus': 'denied' },
    pagination.page,
    pagination.limit,
    sort,
    { hint: 'clinicId_1_billingStatus_1_date_1' }
  );

  await EncounterModel.populate(encounters, [
    { path: 'patientId', select: 'firstName lastName systemId' },
    { path: 'attendingDoctorId', select: 'fullName' },
  ]);

  return res.json({ success: true, data: encounters, meta });
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
