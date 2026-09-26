'use client';

import type { SecurityAssessment as SecurityAssessmentType } from './types';

interface SecurityAssessmentProps {
  assessments?: SecurityAssessmentType[];
}

const TYPE_LABELS: Record<SecurityAssessmentType['type'], string> = {
  vulnerability: 'Vulnerability Scan',
  penetration_test: 'Penetration Test',
  internal_audit: 'Internal Audit',
  compliance_audit: 'Compliance Audit',
};

const STATUS_COLORS: Record<SecurityAssessmentType['status'], string> = {
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
};

export function SecurityAssessment({ assessments = [] }: SecurityAssessmentProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Security Assessments</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Review security assessment results
        </p>
      </div>

      <div className="space-y-3">
        {assessments.length > 0 ? (
          assessments.map((assessment) => (
            <div
              key={assessment.id}
              className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-700"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {TYPE_LABELS[assessment.type]}
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {new Date(assessment.assessmentDate).toLocaleDateString()}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                    <div>
                      <span className="text-neutral-600 dark:text-neutral-400">Total</span>
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {assessment.findings}
                      </p>
                    </div>
                    <div>
                      <span className="text-red-600">Critical</span>
                      <p className="font-semibold">{assessment.criticalFindings}</p>
                    </div>
                    <div>
                      <span className="text-orange-600">High</span>
                      <p className="font-semibold">{assessment.highFindings}</p>
                    </div>
                    <div>
                      <span className="text-yellow-600">Medium</span>
                      <p className="font-semibold">{assessment.mediumFindings}</p>
                    </div>
                    <div>
                      <span className="text-blue-600">Low</span>
                      <p className="font-semibold">{assessment.lowFindings}</p>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-block rounded px-2 py-1 text-xs font-medium ${STATUS_COLORS[assessment.status]}`}
                  >
                    {assessment.status}
                  </span>
                  {assessment.reportUrl && (
                    <div className="mt-2">
                      <a
                        href={assessment.reportUrl}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View Report
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
            No security assessments recorded
          </p>
        )}
      </div>
    </div>
  );
}
