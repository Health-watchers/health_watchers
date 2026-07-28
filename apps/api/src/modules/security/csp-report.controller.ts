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
 *     responses:
 *       204:
 *         description: Report received
 */
router.post('/', cspBodyParser, (req: Request, res: Response) => {
  const report = req.body?.['csp-report'] ?? req.body;

  logger.warn(
    {
      type: 'CSP_VIOLATION',
      documentUri: report?.['document-uri'],
      violatedDirective: report?.['violated-directive'],
      blockedUri: report?.['blocked-uri'],
      referrer: report?.['referrer'],
      ip:
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
        req.socket.remoteAddress,
    },
    'CSP violation reported'
  );

  res.status(204).end();
});

export const cspReportRoutes = router;
