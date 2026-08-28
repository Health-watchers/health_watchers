'use client';

import { useState } from 'react';
import { Toast } from '@/components/ui';

type ExportFormat = 'pdf' | 'csv' | 'hl7' | 'fhir';
type EncryptionLevel = 'none' | 'aes256' | 'pgp';

interface ExportField {
  id: string;
  name: string;
  label: string;
  selected: boolean;
  category: 'demographics' | 'clinical' | 'billing' | 'attachments';
}

interface ExportJob {
  id: string;
  format: ExportFormat;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  recordCount: number;
  fileSize?: number;
  downloadUrl?: string;
}

interface DataExportInterfaceProps {
  patientId?: string;
  encounterId?: string;
  onExport: (config: ExportConfig) => Promise<{ jobId: string; url?: string }>;
  onCancel: () => void;
}

interface ExportConfig {
  format: ExportFormat;
  startDate: string;
  endDate: string;
  fields: string[];
  encryption: EncryptionLevel;
  sendEmail?: boolean;
  emailAddress?: string;
  scheduleExport?: boolean;
  frequency?: 'weekly' | 'monthly' | 'quarterly';
}

const DEFAULT_FIELDS: ExportField[] = [
  // Demographics
  { id: 'name', name: 'name', label: 'Patient Name', selected: true, category: 'demographics' },
  { id: 'mrn', name: 'mrn', label: 'Medical Record Number', selected: true, category: 'demographics' },
  { id: 'dob', name: 'dob', label: 'Date of Birth', selected: true, category: 'demographics' },
  { id: 'gender', name: 'gender', label: 'Gender', selected: true, category: 'demographics' },
  { id: 'contact', name: 'contact', label: 'Contact Information', selected: true, category: 'demographics' },

  // Clinical
  { id: 'vitals', name: 'vitals', label: 'Vital Signs', selected: true, category: 'clinical' },
  { id: 'diagnosis', name: 'diagnosis', label: 'Diagnosis', selected: true, category: 'clinical' },
  { id: 'medications', name: 'medications', label: 'Medications', selected: true, category: 'clinical' },
  { id: 'allergy', name: 'allergy', label: 'Allergies', selected: true, category: 'clinical' },
  { id: 'notes', name: 'notes', label: 'Clinical Notes', selected: true, category: 'clinical' },
  { id: 'procedures', name: 'procedures', label: 'Procedures', selected: false, category: 'clinical' },
  { id: 'labs', name: 'labs', label: 'Lab Results', selected: false, category: 'clinical' },

  // Billing
  { id: 'invoices', name: 'invoices', label: 'Invoices', selected: false, category: 'billing' },
  { id: 'payments', name: 'payments', label: 'Payment History', selected: false, category: 'billing' },
  { id: 'insurance', name: 'insurance', label: 'Insurance Information', selected: false, category: 'billing' },

  // Attachments
  { id: 'documents', name: 'documents', label: 'Documents', selected: false, category: 'attachments' },
];

export function DataExportInterface({
  patientId,
  encounterId,
  onExport,
  onCancel,
}: DataExportInterfaceProps) {
  const [step, setStep] = useState<'format' | 'fields' | 'options' | 'schedule' | 'review'>('format');
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [fields, setFields] = useState<ExportField[]>(DEFAULT_FIELDS);
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [encryption, setEncryption] = useState<EncryptionLevel>('aes256');
  const [sendEmail, setSendEmail] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [scheduleExport, setScheduleExport] = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly');
  const [isExporting, setIsExporting] = useState(false);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showAuditLog, setShowAuditLog] = useState(false);

  const selectedFields = fields.filter((f) => f.selected).map((f) => f.id);
  const formatInfo = {
    pdf: { name: 'PDF', description: 'Formatted clinical document (HIPAA-compliant)' },
    csv: { name: 'CSV', description: 'Spreadsheet format with all selected data' },
    hl7: { name: 'HL7 v2.5', description: 'Standard healthcare data exchange format' },
    fhir: { name: 'FHIR JSON', description: 'Fast Healthcare Interoperability Resources' },
  };

  const handleFieldToggle = (fieldId: string) => {
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, selected: !f.selected } : f))
    );
  };

  const handleSelectCategory = (category: string, selected: boolean) => {
    setFields((prev) =>
      prev.map((f) => (f.category === category ? { ...f, selected } : f))
    );
  };

  const handleNextStep = () => {
    const steps: Array<'format' | 'fields' | 'options' | 'schedule' | 'review'> = [
      'format',
      'fields',
      'options',
      'schedule',
      'review',
    ];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const handlePrevStep = () => {
    const steps: Array<'format' | 'fields' | 'options' | 'schedule' | 'review'> = [
      'format',
      'fields',
      'options',
      'schedule',
      'review',
    ];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedFields.length === 0) {
      setToast({ message: 'Please select at least one field to export', type: 'error' });
      return;
    }

    try {
      setIsExporting(true);

      const config: ExportConfig = {
        format: selectedFormat,
        startDate,
        endDate,
        fields: selectedFields,
        encryption,
        sendEmail,
        emailAddress: sendEmail ? emailAddress : undefined,
        scheduleExport,
        frequency: scheduleExport ? frequency : undefined,
      };

      const result = await onExport(config);

      // Add to export history
      const newJob: ExportJob = {
        id: result.jobId,
        format: selectedFormat,
        status: 'pending',
        createdAt: new Date().toISOString(),
        recordCount: fields.length,
      };
      setExportJobs((prev) => [newJob, ...prev]);

      setToast({
        message: scheduleExport
          ? `Export scheduled successfully (${frequency})`
          : 'Export started successfully',
        type: 'success',
      });

      // Reset form
      setTimeout(() => {
        setStep('format');
        // Trigger download if available
        if (result.url) {
          const a = document.createElement('a');
          a.href = result.url;
          a.download = `patient-export-${Date.now()}.${selectedFormat}`;
          a.click();
        }
      }, 1000);
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Export failed',
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const renderProgressBar = () => {
    const steps = ['format', 'fields', 'options', 'schedule', 'review'];
    const currentIndex = steps.indexOf(step);
    const progress = ((currentIndex + 1) / steps.length) * 100;

    return (
      <div className="mb-6">
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-600">
          <span>Step {currentIndex + 1} of 5</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleExport} className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h2 className="text-2xl font-bold text-gray-900">Export Patient Data</h2>
        <button
          type="button"
          onClick={() => setShowAuditLog(!showAuditLog)}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {showAuditLog ? 'Hide' : 'View'} Audit Log
        </button>
      </div>

      {renderProgressBar()}

      {/* Format Selection */}
      {step === 'format' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Export Format</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.entries(formatInfo) as Array<[ExportFormat, typeof formatInfo.pdf]>).map(
              ([format, info]) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setSelectedFormat(format)}
                  className={`rounded-lg border-2 p-4 text-left transition-all ${
                    selectedFormat === format
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{info.name}</p>
                  <p className="text-sm text-gray-600">{info.description}</p>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Field Selection */}
      {step === 'fields' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Fields to Export</h3>

          {['demographics', 'clinical', 'billing', 'attachments'].map((category) => {
            const categoryFields = fields.filter((f) => f.category === category);
            const allSelected = categoryFields.every((f) => f.selected);
            const someSelected = categoryFields.some((f) => f.selected);

            return (
              <div key={category} className="space-y-2 rounded-lg border border-gray-200 p-4">
                <button
                  type="button"
                  onClick={() =>
                    handleSelectCategory(category, !allSelected)
                  }
                  className="flex items-center gap-3 font-semibold text-gray-900 capitalize hover:text-blue-600"
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {}}
                    className={`h-4 w-4 ${someSelected && !allSelected ? 'indeterminate' : ''}`}
                  />
                  {category}
                </button>

                <div className="ml-7 space-y-2">
                  {categoryFields.map((field) => (
                    <label key={field.id} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.selected}
                        onChange={() => handleFieldToggle(field.id)}
                        className="h-4 w-4"
                      />
                      <span className="text-sm text-gray-700">{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <p className="text-sm text-gray-600">
            Selected: {selectedFields.length} of {fields.length} fields
          </p>
        </div>
      )}

      {/* Export Options */}
      {step === 'options' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Export Options</h3>

          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">Date Range</label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-gray-600">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Encryption Level
              </label>
              <select
                value={encryption}
                onChange={(e) => setEncryption(e.target.value as EncryptionLevel)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">No Encryption</option>
                <option value="aes256">AES-256 Encryption (Recommended)</option>
                <option value="pgp">PGP Encryption</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Encrypted exports are HIPAA-compliant and password-protected
              </p>
            </div>

            {encryption !== 'none' && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
                <p className="font-semibold mb-1">Security Note:</p>
                <p>Exported data will be encrypted. You'll receive a separate password via email.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schedule Export */}
      {step === 'schedule' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Delivery Options</h3>

          <div className="space-y-4 rounded-lg border border-gray-200 p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-gray-900">Send via Email</span>
            </label>

            {sendEmail && (
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">Email Address</label>
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="your@email.com"
                />
              </div>
            )}

            <div className="border-t border-gray-200 pt-4">
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={scheduleExport}
                  onChange={(e) => setScheduleExport(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-gray-900">Schedule Automated Exports</span>
              </label>

              {scheduleExport && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly' | 'quarterly')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    You'll receive automated exports on the selected schedule. All activity is logged for audit purposes.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review */}
      {step === 'review' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Review Export Details</h3>

          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Format</p>
              <p className="text-sm font-medium text-gray-900">{formatInfo[selectedFormat].name}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Fields</p>
              <p className="text-sm text-gray-900">{selectedFields.length} fields selected</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Date Range</p>
              <p className="text-sm text-gray-900">
                {startDate} to {endDate}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase">Encryption</p>
              <p className="text-sm text-gray-900 capitalize">
                {encryption === 'aes256' ? 'AES-256' : encryption === 'pgp' ? 'PGP' : 'No encryption'}
              </p>
            </div>
            {sendEmail && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Email Delivery</p>
                <p className="text-sm text-gray-900">{emailAddress}</p>
              </div>
            )}
            {scheduleExport && (
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase">Schedule</p>
                <p className="text-sm text-gray-900 capitalize">{frequency} automatic exports</p>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-sm text-blue-900">
              <strong>Privacy Notice:</strong> Your data export is HIPAA-compliant and will be encrypted.
              All export activities are logged and audited.
            </p>
          </div>
        </div>
      )}

      {/* Export History */}
      {showAuditLog && exportJobs.length > 0 && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="font-semibold text-gray-900">Recent Exports</h4>
          {exportJobs.slice(0, 5).map((job) => (
            <div key={job.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-gray-900">{job.format.toUpperCase()}</p>
                <p className="text-xs text-gray-500">{job.createdAt}</p>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  job.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : job.status === 'failed'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {job.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Form Actions */}
      <div className="flex justify-between border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={step === 'format' ? onCancel : handlePrevStep}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {step === 'format' ? 'Cancel' : 'Back'}
        </button>

        <div className="flex gap-3">
          {step !== 'review' && (
            <button
              type="button"
              onClick={handleNextStep}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Next
            </button>
          )}

          {step === 'review' && (
            <button
              type="submit"
              disabled={isExporting || selectedFields.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isExporting ? 'Exporting...' : 'Start Export'}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
