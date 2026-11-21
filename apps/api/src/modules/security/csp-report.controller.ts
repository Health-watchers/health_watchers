import express, { Request, Response, Router } from 'express';
import logger from '../../utils/logger';

const router = Router();

const cspBodyParser = express.json({
  type: ['application/json', 'application/csp-report'],
});

/**
 * @swagger
 * /csp-report:
 *   post:
 *     summary: Receive Content Security Policy violation reports
 *     tags: [Security]
 *     requestBody:
 *       required: true
 *       content:
 *         application/csp-report:
 *           schema:
 *             type: object
 *             properties:
 *               csp-report:
 *                 type: object
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               csp-report:
 *                 type: object
 *     responses:
 *       204:
 *         description: Report received
 */
router.post('/', cspBodyParser, (req: Request, res: Response) => {
  const report = req.body?.['csp-report'] ?? req.body ?? {};

  const effectiveDirective =
    report['effective-directive'] ?? report['violated-directive'];
  const disposition = report['disposition'];
  const statusCode = report['status-code'];
  const scriptSample = report['script-sample'];
  const sourceFile = report['source-file'];
  const lineNumber = report['line-number'];
  const columnNumber = report['column-number'];

  logger.warn(
    {
      type: 'CSP_VIOLATION',
      documentUri: report['document-uri'],
      referrer: report['referrer'],
      violatedDirective: report['violated-directive'],
      effectiveDirective,
      originalPolicy: report['original-policy'],
      blockedUri: report['blocked-uri'],
      disposition,
      statusCode,
      sourceFile,
      lineNumber,
      columnNumber,
      scriptSample,
      ip:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    },
    'CSP violation reported'
  );

  res.status(204).end();
});

export const cspReportRoutes = router;