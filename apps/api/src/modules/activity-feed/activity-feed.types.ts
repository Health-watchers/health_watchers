export type ActivityEventType =
  | 'appointment_scheduled'
  | 'appointment_completed'
  | 'prescription_created'
  | 'lab_result_posted'
  | 'message_sent'
  | 'document_uploaded'
  | 'billing_charge'
  | 'note_added'
  | 'login'
  | 'profile_updated';

export interface ActivityEvent {
  id: string;
  patientId: string;
  actorId: string;
  type: ActivityEventType;
  timestamp: string;
  summary: string;
  metadata?: Record<string, unknown>;
  visibility: 'patient' | 'care_team' | 'restricted';
}

export interface ActivityFilter {
  types?: ActivityEventType[];
  from?: string;
  to?: string;
  search?: string;
  actorId?: string;
}

export interface NotificationPreference {
  userId: string;
  eventType: ActivityEventType;
  channel: 'email' | 'sms' | 'push' | 'in_app';
  enabled: boolean;
}

export interface RetentionPolicy {
  eventType: ActivityEventType;
  retentionDays: number;
}

export interface SuspiciousActivityFlag {
  patientId: string;
  reason: string;
  events: string[];
  detectedAt: string;
  severity: 'low' | 'medium' | 'high';
}
