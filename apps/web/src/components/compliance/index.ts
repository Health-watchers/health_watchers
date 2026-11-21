export type * from './types';
export { BAADocumentManager } from './BAADocumentManager';
export { ComplianceChecklist } from './ComplianceChecklist';
export { AuditLogViewer } from './AuditLogViewer';
export { BreachIncidentReporter } from './BreachIncidentReporter';
export { ConsentManager } from './ConsentManager';
export { PolicyAcknowledgment } from './PolicyAcknowledgment';
export { EmployeeTraining } from './EmployeeTraining';
export { SecurityAssessment } from './SecurityAssessment';

import dynamic from 'next/dynamic';

export const ComplianceReportGenerator = dynamic(
  () =>
    import('./ComplianceReportGenerator').then(
      (mod) => mod.ComplianceReportGenerator
    ),
  {
    loading: () => null,
  }
);