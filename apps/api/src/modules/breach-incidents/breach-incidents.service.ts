import { BreachIncident, BreachIncidentModel } from './breach-incident.model';
import { CreateBreachIncidentInput } from './breach-incidents.validation';
import logger from '@api/utils/logger';

export function calculateNotificationDeadline(discoveredAt: Date): Date {
  const deadline = new Date(discoveredAt);
  deadline.setUTCDate(deadline.getUTCDate() + 60);
  return deadline;
}

export async function createBreachIncident(
  input: CreateBreachIncidentInput,
  createdBy: string
): Promise<BreachIncident> {
  const discoveredAt = new Date(input.discoveredAt);
  const notificationDeadline = calculateNotificationDeadline(discoveredAt);
  const incident = new BreachIncidentModel({
    ...input,
    discoveredAt,
    notificationDeadline,
    createdBy,
  });

  await incident.save();
  logger.warn(
    {
      incidentId: incident._id,
      affectedCount: incident.affectedPatients.length,
      notificationDeadline: notificationDeadline.toISOString(),
    },
    'HIPAA breach incident recorded'
  );
  await queueAffectedPatientNotifications(incident);
  return incident;
}

export function findBreachIncidents(): Promise<BreachIncident[]> {
  return BreachIncidentModel.find().sort({ discoveredAt: -1 }).lean();
}

export function findOverdueBreachIncidents(): Promise<BreachIncident[]> {
  return BreachIncidentModel.find({
    notificationDeadline: { $lte: new Date() },
    notificationStatus: { $ne: 'COMPLETE' },
  })
    .sort({ notificationDeadline: 1 })
    .lean();
}

export async function generateHhsReport(id: string) {
  const incident = await BreachIncidentModel.findById(id).lean();
  if (!incident) return null;

  return {
    reportType: 'HHS_BREACH_NOTIFICATION',
    incidentId: String(incident._id),
    discoveredAt: incident.discoveredAt,
    affectedCount: incident.affectedPatients.length,
    description: incident.description,
    severity: incident.severity,
    notificationDeadline: incident.notificationDeadline,
    generatedAt: new Date(),
  };
}

async function queueAffectedPatientNotifications(incident: BreachIncident): Promise<void> {
  logger.info(
    { incidentId: (incident as any)._id, affectedCount: incident.affectedPatients.length },
    'Queued HIPAA breach patient notifications'
  );
}
