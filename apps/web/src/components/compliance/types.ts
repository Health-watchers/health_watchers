export interface BAADocument {
  id: string;
  name: string;
  version: string;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  effectiveDate: string;
  expiryDate?: string;
}

export interface ComplianceChecklistItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'pending' | 'in_progress' | 'completed';
  dueDate: string;
  completedDate?: string;
  responsibility: string;
  priority: 'low' | 'medium' | 'high';
}

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  status: 'success' | 'failure';
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
}

export interface BreachIncident {
  id: string;
  title: string;
  description: string;
  detectedAt: string;
  reportedAt: string;
  status: 'investigating' | 'contained' | 'resolved' | 'closed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedRecords: number;
  investigationNotes: string;
  resolution: string;
}

export interface Consent {
  id: string;
  type: 'treatment' | 'research' | 'marketing' | 'data_sharing';
  patientId: string;
  consentedAt: string;
  expiryDate?: string;
  status: 'active' | 'revoked' | 'expired';
  documentPath?: string;
}

export interface PolicyAcknowledgment {
  id: string;
  employeeId: string;
  policyName: string;
  version: string;
  acknowledgedAt: string;
  expiryDate?: string;
  status: 'current' | 'expired';
  acknowledgedBy: string;
}

export interface EmployeeTraining {
  id: string;
  employeeId: string;
  trainingType: 'hipaa' | 'privacy' | 'security' | 'compliance';
  completedAt?: string;
  expiryDate?: string;
  certificateUrl?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'expired';
}

export interface SecurityAssessment {
  id: string;
  assessmentDate: string;
  type: 'vulnerability' | 'penetration_test' | 'internal_audit' | 'compliance_audit';
  status: 'pending' | 'in_progress' | 'completed';
  findings: number;
  criticalFindings: number;
  highFindings: number;
  mediumFindings: number;
  lowFindings: number;
  reportUrl?: string;
}

export interface DataRetentionPolicy {
  id: string;
  dataType: string;
  retentionPeriod: string;
  archiveLocation?: string;
  deletionMethod: string;
  policyVersion: string;
  effectiveDate: string;
  status: 'active' | 'archived';
}

export interface ComplianceReport {
  id: string;
  title: string;
  generatedAt: string;
  reportType: 'hipaa' | 'privacy' | 'security' | 'comprehensive';
  period: {
    startDate: string;
    endDate: string;
  };
  status: 'draft' | 'final';
  sections: Array<{
    title: string;
    content: string;
    metrics?: Record<string, any>;
  }>;
  fileName?: string;
}
