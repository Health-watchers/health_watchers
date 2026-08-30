/**
 * #1251 — Scheduled report worker.
 *
 * Every `TICK_MS` the worker claims schedules whose `nextRunAt` is due, runs
 * the underlying query for the schedule's rolling window, records a
 * {@link ReportRunModel} entry and notifies recipients. Claiming uses an
 * atomic `findOneAndUpdate` that bumps `nextRunAt` forward so multiple API
 * instances never double-run the same schedule.
 */

import logger from '../../../utils/logger';
import { createNotification } from '../../notifications/notification.service';
import {
  ReportScheduleModel,
  ReportRunModel,
  computeNextRun,
  type IReportSchedule,
} from '../models/report-schedule.model';
import { runQuery, type QueryDefinition } from './query-builder.service';
import { getReportTemplate } from './report-templates';

const TICK_MS = 60_000;
const BATCH = 20;
let timer: ReturnType<typeof setInterval> | null = null;

function scheduleToQuery(schedule: IReportSchedule): QueryDefinition {
  const to = new Date();
  const from = new Date(to.getTime() - schedule.windowDays * 86400_000);
  const window = { from: from.toISOString(), to: to.toISOString() };

  if (schedule.templateId) {
    const template = getReportTemplate(schedule.templateId);
    if (!template) throw new Error(`Unknown template "${schedule.templateId}"`);
    return { ...template.query, ...window } as QueryDefinition;
  }
  return { ...(schedule.query as object), ...window } as QueryDefinition;
}

async function runDueSchedule(schedule: IReportSchedule & { _id: unknown }): Promise<void> {
  const query = scheduleToQuery(schedule);
  const to = new Date(query.to as string);
  const from = new Date(query.from as string);

  try {
    const result = await runQuery(query, schedule.clinicId);

    await ReportRunModel.create({
      scheduleId: schedule._id,
      clinicId: schedule.clinicId,
      status: 'success',
      rowCount: result.rowCount,
      elapsedMs: result.elapsedMs,
      window: { from, to },
    });

    await Promise.allSettled(
      schedule.recipients.map((recipient) =>
        createNotification({
          userId: recipient,
          clinicId: schedule.clinicId,
          type: 'report_ready',
          title: `Report ready: ${schedule.name}`,
          message: `${schedule.name} generated ${result.rowCount} rows for the last ${schedule.windowDays} days.`,
          metadata: {
            scheduleId: String(schedule._id),
            rowCount: result.rowCount,
            format: schedule.format,
          },
        }).catch(() => undefined)
      )
    );

    logger.info(
      { scheduleId: String(schedule._id), rows: result.rowCount, elapsedMs: result.elapsedMs },
      '[report-schedule] run complete'
    );
  } catch (err) {
    await ReportRunModel.create({
      scheduleId: schedule._id,
      clinicId: schedule.clinicId,
      status: 'error',
      window: { from, to },
      error: err instanceof Error ? err.message : 'Unknown error',
    }).catch(() => undefined);
    logger.error({ err, scheduleId: String(schedule._id) }, '[report-schedule] run failed');
  }
}

export async function processDueReportSchedules(now: Date = new Date()): Promise<number> {
  let processed = 0;

  for (let i = 0; i < BATCH; i++) {
    // Atomically claim one due schedule and push its next run forward.
    const candidate = await ReportScheduleModel.findOne({
      isActive: true,
      nextRunAt: { $lte: now },
    })
      .sort({ nextRunAt: 1 })
      .lean();
    if (!candidate) break;

    const claimed = await ReportScheduleModel.findOneAndUpdate(
      { _id: candidate._id, nextRunAt: candidate.nextRunAt },
      {
        $set: {
          lastRunAt: now,
          nextRunAt: computeNextRun(candidate.cadence, candidate.hourUtc, now),
        },
      },
      { new: false }
    ).lean();

    // Lost the race to another instance — skip.
    if (!claimed) continue;

    await runDueSchedule(candidate as IReportSchedule & { _id: unknown });
    processed += 1;
  }

  return processed;
}

export function startReportScheduleJob(): void {
  if (timer) return;
  timer = setInterval(() => {
    processDueReportSchedules().catch((err) =>
      logger.error({ err }, '[report-schedule] tick failed')
    );
  }, TICK_MS);
  logger.info('[report-schedule] worker started');
}

export function stopReportScheduleJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('[report-schedule] worker stopped');
  }
}
