import { Request, Response, Router } from 'express';
import { Types } from 'mongoose';
import { AuditLogModel } from './audit.model';
import { authenticate } from '../../middlewares/auth.middleware';
import logger from '../../utils/logger';

const router = Router();

/**
 * @swagger
 * /audit-logs:
 *   get:
 *     summary: Retrieve audit logs with filtering, full-text search, and cursor pagination (SUPER_ADMIN only)
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 50 }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: Opaque cursor for cursor-based pagination (overrides page)
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Full-text search across action and metadata fields
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: clinicId
 *         schema: { type: string }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: resourceType
 *         schema: { type: string }
 *       - in: query
 *         name: resourceId
 *         schema: { type: string }
 *       - in: query
 *         name: outcome
 *         schema: { type: string, enum: [SUCCESS, FAILURE] }
 *       - in: query
 *         name: ipAddress
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *       403:
 *         description: Forbidden
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden', message: 'SUPER_ADMIN role required' });
  }

  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const sortDir = req.query.sort === 'asc' ? 1 : -1;

  // Build filter
  const filter: Record<string, unknown> = {};

  if (req.query.userId) filter.userId = new Types.ObjectId(req.query.userId as string);
  if (req.query.clinicId) filter.clinicId = new Types.ObjectId(req.query.clinicId as string);
  if (req.query.action) filter.action = req.query.action;
  if (req.query.resourceType) filter.resourceType = req.query.resourceType;
  if (req.query.resourceId) filter.resourceId = req.query.resourceId;
  if (req.query.outcome) filter.outcome = req.query.outcome;
  if (req.query.ipAddress) filter.ipAddress = req.query.ipAddress;

  if (req.query.dateFrom || req.query.dateTo) {
    const range: Record<string, Date> = {};
    if (req.query.dateFrom) range.$gte = new Date(req.query.dateFrom as string);
    if (req.query.dateTo) range.$lte = new Date(req.query.dateTo as string);
    filter.timestamp = range;
  }

 // Full-text search (requires text index on action + metadata)
  if (req.query.q) {
    const searchTerm = String(req.query.q).slice(0, 200);
    filter.$text = { $search: searchTerm };
  }
  // Cursor-based pagination: cursor encodes the last seen timestamp + _id
  if (req.query.cursor) {
    try {
      const { ts, id } = JSON.parse(Buffer.from(req.query.cursor as string, 'base64').toString());
      // Whitelist the operator — never derive it from user input
      const op: '$lt' | '$gt' = sortDir === -1 ? '$lt' : '$gt';
      const cursorTs = new Date(ts);
      const cursorId = new Types.ObjectId(String(id));
      if (op === '$lt') {
        filter.$or = [
          { timestamp: { $lt: cursorTs } },
          { timestamp: cursorTs, _id: { $lt: cursorId } },
        ];
      } else {
        filter.$or = [
          { timestamp: { $gt: cursorTs } },
          { timestamp: cursorTs, _id: { $gt: cursorId } },
        ];
      }
    } catch {
      return res.status(400).json({ error: 'BadRequest', message: 'Invalid cursor' });
    }
  }

  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const skip = req.query.cursor ? 0 : (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ timestamp: sortDir, _id: sortDir })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'fullName email')
        .populate('clinicId', 'name')
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    // Build next cursor from last item
    let nextCursor: string | null = null;
    if (logs.length === limit) {
      const last = logs[logs.length - 1];
      nextCursor = Buffer.from(
        JSON.stringify({ ts: (last as any).timestamp, id: String((last as any)._id) })
      ).toString('base64');
    }

    return res.json({
      status: 'success',
      data: {
        logs,
        pagination: {
          page: req.query.cursor ? null : page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          nextCursor,
        },
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching audit logs');
    return res.status(500).json({ error: 'InternalServerError', message: 'Failed to retrieve audit logs' });
  }
});

/**
 * @swagger
 * /audit-logs/summary:
 *   get:
 *     summary: Action counts by type (SUPER_ADMIN only)
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: clinicId
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Summary of action counts
 */
router.get('/summary', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden', message: 'SUPER_ADMIN role required' });
  }

  const match: Record<string, unknown> = {};
  if (req.query.clinicId) match.clinicId = new Types.ObjectId(req.query.clinicId as string);
  if (req.query.dateFrom || req.query.dateTo) {
    const range: Record<string, Date> = {};
    if (req.query.dateFrom) range.$gte = new Date(req.query.dateFrom as string);
    if (req.query.dateTo) range.$lte = new Date(req.query.dateTo as string);
    match.timestamp = range;
  }

  try {
    const summary = await AuditLogModel.aggregate([
      { $match: match },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return res.json({
      status: 'success',
      data: summary.map(s => ({ action: s._id, count: s.count })),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching audit summary');
    return res.status(500).json({ error: 'InternalServerError', message: 'Failed to retrieve audit summary' });
  }
});

/**
 * @swagger
 * /audit-logs/export:
 *   get:
 *     summary: Export audit logs as CSV (SUPER_ADMIN only)
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: outcome
 *         schema: { type: string, enum: [SUCCESS, FAILURE] }
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/export', authenticate, async (req: Request, res: Response) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden', message: 'SUPER_ADMIN role required' });
  }

  const filter: Record<string, unknown> = {};
  if (req.query.userId) filter.userId = new Types.ObjectId(req.query.userId as string);
  if (req.query.action) filter.action = req.query.action;
  if (req.query.outcome) filter.outcome = req.query.outcome;
  if (req.query.dateFrom || req.query.dateTo) {
    const range: Record<string, Date> = {};
    if (req.query.dateFrom) range.$gte = new Date(req.query.dateFrom as string);
    if (req.query.dateTo) range.$lte = new Date(req.query.dateTo as string);
    filter.timestamp = range;
  }

  try {
    // Cap export at 10 000 rows to prevent memory exhaustion
    const logs = await AuditLogModel.find(filter)
      .sort({ timestamp: -1 })
      .limit(10_000)
      .lean();

    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    const header = 'timestamp,action,outcome,userId,clinicId,resourceType,resourceId,ipAddress,userAgent,requestId';
    const rows = logs.map(l =>
      [
        l.timestamp?.toISOString() ?? '',
        l.action,
        l.outcome,
        l.userId ?? '',
        l.clinicId ?? '',
        l.resourceType ?? '',
        l.resourceId ?? '',
        l.ipAddress ?? '',
        l.userAgent ?? '',
        l.requestId ?? '',
      ]
        .map(escape)
        .join(',')
    );

    const csv = [header, ...rows].join('\n');
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    logger.error({ err: error }, 'Error exporting audit logs');
    return res.status(500).json({ error: 'InternalServerError', message: 'Failed to export audit logs' });
  }
});

export const auditRoutes = router;
