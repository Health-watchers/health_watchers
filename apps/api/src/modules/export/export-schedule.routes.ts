/**
 * Export scheduling REST routes (Issue #1243).
 *
 * POST   /exports/schedules            – create a schedule (CLINIC_ADMIN / SUPER_ADMIN)
 * GET    /exports/schedules            – list schedules for caller's clinic
 * PATCH  /exports/schedules/:id        – update schedule
 * DELETE /exports/schedules/:id        – delete schedule
 * POST   /exports/schedules/:id/enable – enable schedule
 * POST   /exports/schedules/:id/disable – disable schedule
 * POST   /exports/schedules/:id/run    – trigger immediately
 */

import { Router, Request, Response } from 'express';
import { authenticate, requireRoles } from '@api/middlewares/auth.middleware';
import { auditLog } from '@api/modules/audit/audit.service';
import logger from '@api/utils/logger';
import { exportScheduler } from './export-scheduler.service';

const router = Router();
router.use(authenticate);
router.use(requireRoles('CLINIC_ADMIN', 'SUPER_ADMIN'));

router.post('/', async (req: Request, res: Response) => {
  try {
    const { clinicId, userId } = req.user!;
    const { name, cronExpression, format, patientId, encrypt, sign } = req.body;

    if (!name || !cronExpression || !format) {
      return res.status(400).json({
        error: 'BadRequest',
        message: 'name, cronExpression, and format are required',
      });
    }

    const schedule = await exportScheduler.createSchedule({
      clinicId,
      name,
      cronExpression,
      format,
      patientId,
      encrypt: !!encrypt,
      sign: !!sign,
      createdBy: userId,
    });

    await auditLog(
      {
        action: 'EXPORT_SCHEDULE_CREATED',
        resourceType: 'ExportSchedule',
        resourceId: String(schedule._id),
        userId,
        clinicId,
        metadata: { name, format, cronExpression },
      },
      req
    );

    return res.status(201).json({ status: 'success', data: schedule });
  } catch (err: any) {
    logger.error({ err }, 'Failed to create export schedule');
    const msg = err?.message?.includes('Invalid cron') ? err.message : 'Failed to create schedule';
    return res.status(err?.message?.includes('Invalid cron') ? 400 : 500).json({
      error: 'Error',
      message: msg,
    });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const { clinicId } = req.user!;
    const schedules = await exportScheduler.listSchedules(clinicId);
    return res.json({ status: 'success', data: schedules });
  } catch (err: any) {
    logger.error({ err }, 'Failed to list export schedules');
    return res.status(500).json({ error: 'InternalError', message: 'Failed to list schedules' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { userId, clinicId } = req.user!;
    const schedule = await exportScheduler.updateSchedule(req.params.id, req.body);
    if (!schedule)
      return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });

    await auditLog(
      {
        action: 'EXPORT_SCHEDULE_UPDATED',
        resourceType: 'ExportSchedule',
        resourceId: req.params.id,
        userId,
        clinicId,
        metadata: req.body,
      },
      req
    );
    return res.json({ status: 'success', data: schedule });
  } catch (err: any) {
    logger.error({ err }, 'Failed to update export schedule');
    return res.status(500).json({ error: 'InternalError', message: 'Failed to update schedule' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { userId, clinicId } = req.user!;
    const deleted = await exportScheduler.deleteSchedule(req.params.id);
    if (!deleted)
      return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });

    await auditLog(
      {
        action: 'EXPORT_SCHEDULE_DELETED',
        resourceType: 'ExportSchedule',
        resourceId: req.params.id,
        userId,
        clinicId,
      },
      req
    );
    return res.status(204).send();
  } catch (err: any) {
    logger.error({ err }, 'Failed to delete export schedule');
    return res.status(500).json({ error: 'InternalError', message: 'Failed to delete schedule' });
  }
});

router.post('/:id/enable', async (req: Request, res: Response) => {
  try {
    const schedule = await exportScheduler.setEnabled(req.params.id, true);
    if (!schedule)
      return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });
    return res.json({ status: 'success', data: schedule });
  } catch (err: any) {
    logger.error({ err }, 'Failed to enable export schedule');
    return res.status(500).json({ error: 'InternalError', message: 'Failed to enable schedule' });
  }
});

router.post('/:id/disable', async (req: Request, res: Response) => {
  try {
    const schedule = await exportScheduler.setEnabled(req.params.id, false);
    if (!schedule)
      return res.status(404).json({ error: 'NotFound', message: 'Schedule not found' });
    return res.json({ status: 'success', data: schedule });
  } catch (err: any) {
    logger.error({ err }, 'Failed to disable export schedule');
    return res.status(500).json({ error: 'InternalError', message: 'Failed to disable schedule' });
  }
});

router.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const { userId, clinicId } = req.user!;
    const result = await exportScheduler.runScheduleNow(req.params.id);

    await auditLog(
      {
        action: 'EXPORT_SCHEDULE_RUN',
        resourceType: 'ExportSchedule',
        resourceId: req.params.id,
        userId,
        clinicId,
        metadata: { status: result.status, recordCount: result.recordCount },
      },
      req
    );
    return res.json({ status: 'success', data: result });
  } catch (err: any) {
    logger.error({ err }, 'Failed to run export schedule');
    return res.status(500).json({ error: 'InternalError', message: 'Failed to run schedule' });
  }
});

export default router;
