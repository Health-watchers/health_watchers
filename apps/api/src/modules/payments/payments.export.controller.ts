import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { PaymentRecordModel } from './models/payment-record.model';
import { authenticate } from '@api/middlewares/auth.middleware';
import { validateRequest } from '@api/middlewares/validate.middleware';
import { asyncHandler } from '@api/middlewares/async.handler';
import { auditLog } from '@api/modules/audit/audit.service';

const STELLAR_EXPLORER: Record<string, string> = {
  testnet: 'https://stellar.expert/explorer/testnet/tx',
  mainnet: 'https://stellar.expert/explorer/public/tx',
};

const exportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx']).default('csv'),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum(['all', 'confirmed', 'pending', 'failed']).default('all'),
  currency: z.enum(['XLM', 'USDC', 'all']).default('all'),
});

type ExportQuery = z.infer<typeof exportQuerySchema>;

const STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? 'testnet';
const EXPLORER_BASE = STELLAR_EXPLORER[STELLAR_NETWORK] ?? STELLAR_EXPLORER.testnet;

const HEADERS = [
  { key: 'dateTime', header: 'Date/Time (UTC)' },
  { key: 'txHash', header: 'Transaction Hash' },
  { key: 'explorerLink', header: 'Stellar Explorer Link' },
  { key: 'type', header: 'Type' },
  { key: 'patientId', header: 'Patient ID' },
  { key: 'amount', header: 'Amount' },
  { key: 'currency', header: 'Currency' },
  { key: 'fee', header: 'Fee (XLM)' },
  { key: 'status', header: 'Status' },
  { key: 'memo', header: 'Memo' },
  { key: 'invoiceNumber', header: 'Invoice Number' },
];

function buildQuery(clinicId: string, q: ExportQuery) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { clinicId };
  if (q.status !== 'all') filter.status = q.status;
  if (q.currency !== 'all') filter.assetCode = q.currency;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(q.from);
    if (q.to) filter.createdAt.$lte = new Date(q.to);
  }
  return filter;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRow(p: any) {
  return {
    dateTime: p.createdAt ? new Date(p.createdAt).toISOString() : '',
    txHash: p.txHash ?? '',
    explorerLink: p.txHash ? `${EXPLORER_BASE}/${p.txHash}` : '',
    type: p.claimableBalanceId ? 'claimable' : 'payment',
    patientId: p.patientId ? String(p.patientId).slice(-8).toUpperCase() : 'N/A',
    amount: p.amount ?? '',
    currency: p.assetCode ?? '',
    fee: p.feeStrategy ?? '',
    status: p.status ?? '',
    memo: p.memo ?? '',
    invoiceNumber: p.receiptNumber ?? '',
  };
}

function buildFilename(q: ExportQuery, ext: string): string {
  const from = q.from ? q.from.slice(0, 10) : 'all';
  const to = q.to ? q.to.slice(0, 10) : 'now';
  return `payments-export_${from}_${to}.${ext}`;
}

function buildCsv(rows: ReturnType<typeof toRow>[]): string {
  const headerLine = HEADERS.map((h) => h.header).join(',');
  const dataLines = rows.map((r) =>
    HEADERS.map(({ key }) => {
      const val = String(r[key as keyof typeof r] ?? '');
      return `"${val.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

async function buildXlsx(rows: ReturnType<typeof toRow>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const allSheet = wb.addWorksheet('All Transactions');
  const xlmSheet = wb.addWorksheet('XLM');
  const usdcSheet = wb.addWorksheet('USDC');

  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } },
    alignment: { horizontal: 'center' },
  };

  for (const sheet of [allSheet, xlmSheet, usdcSheet]) {
    sheet.columns = HEADERS.map((h) => ({ key: h.key, header: h.header, width: 22 }));
    sheet.getRow(1).eachCell((cell) => {
      cell.style = headerStyle;
    });
  }

  let totalAmount = 0;
  let count = 0;

  for (const row of rows) {
    allSheet.addRow(row);
    if (row.currency === 'XLM') xlmSheet.addRow(row);
    if (row.currency === 'USDC') usdcSheet.addRow(row);
    const amt = parseFloat(row.amount);
    if (!isNaN(amt)) totalAmount += amt;
    count++;
  }

  // Summary row on All Transactions sheet
  const summaryRow = allSheet.addRow({
    dateTime: 'TOTAL',
    amount: totalAmount.toFixed(7),
    invoiceNumber: `${count} records`,
  });
  summaryRow.font = { bold: true };
  summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };

  // Auto-fit columns (approximate)
  for (const sheet of [allSheet, xlmSheet, usdcSheet]) {
    sheet.columns.forEach((col) => {
      if (col.key) col.width = Math.max(col.width ?? 12, col.header?.length ?? 0, 18);
    });
  }

  return wb.xlsx.writeBuffer() as Promise<Buffer>;
}

const router = Router();
router.use(authenticate);

// GET /payments/export
router.get(
  '/export',
  validateRequest({ query: exportQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as ExportQuery;
    const clinicId = req.user!.clinicId;

    const filter = buildQuery(clinicId, q);
    const records = await PaymentRecordModel.find(filter).sort({ createdAt: -1 }).lean();
    const rows = records.map(toRow);

    // Audit log
    await auditLog(
      {
        action: 'PAYMENT_EXPORT',
        resourceType: 'PaymentRecord',
        userId: req.user!.id,
        clinicId,
        metadata: {
          format: q.format,
          from: q.from,
          to: q.to,
          status: q.status,
          currency: q.currency,
          recordCount: rows.length,
        },
      },
      req
    );

    if (q.format === 'xlsx') {
      const buffer = await buildXlsx(rows);
      const filename = buildFilename(q, 'xlsx');
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
    }

    // CSV (default)
    const csv = buildCsv(rows);
    const filename = buildFilename(q, 'csv');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  })
);

export const paymentExportRoutes = router;
