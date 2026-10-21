export type AuditAction = 'create' | 'update' | 'delete' | 'read' | 'restore';

export interface ImmutableAuditEntry {
  id: string;
  sequence: number;
  entityType: string;
  entityId: string;
  action: AuditAction;
  actorId: string;
  timestamp: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changedFields: string[];
  hash: string;
  previousHash: string;
  encrypted: boolean;
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: AuditAction;
  from?: string;
  to?: string;
}

export interface AuditRetentionPolicy {
  entityType: string;
  retentionDays: number;
  archiveAfterDays: number;
}

export interface AuditAlertRule {
  id: string;
  entityType: string;
  action: AuditAction;
  description: string;
}

export interface AuditAlert {
  ruleId: string;
  entry: ImmutableAuditEntry;
  triggeredAt: string;
}

export interface ComplianceReport {
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  totalEvents: number;
  byAction: Record<string, number>;
  byEntityType: Record<string, number>;
  integrityValid: boolean;
}
