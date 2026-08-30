'use client';

import { useState } from 'react';
import { AlertCircle, FileText, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface DisputeData {
  paymentId: string;
  reason: string;
  description: string;
  attachments?: File[];
  contactEmail: string;
  contactPhone?: string;
}

interface DisputeFilingFormProps {
  paymentId: string;
  onSubmit: (data: DisputeData) => Promise<void>;
  isLoading?: boolean;
}

export function DisputeFilingForm({
  paymentId,
  onSubmit,
  isLoading = false,
}: DisputeFilingFormProps) {
  const [formData, setFormData] = useState({
    reason: '',
    description: '',
    contactEmail: '',
    contactPhone: '',
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const disputeReasons = [
    { value: 'duplicate', label: 'Duplicate Charge' },
    { value: 'unauthorized', label: 'Unauthorized Transaction' },
    { value: 'amount_mismatch', label: 'Amount Mismatch' },
    { value: 'service_not_received', label: 'Service Not Received' },
    { value: 'billing_error', label: 'Billing Error' },
    { value: 'other', label: 'Other' },
  ];

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const totalSize =
        attachments.reduce((sum, f) => sum + f.size, 0) + files.reduce((sum, f) => sum + f.size, 0);

      if (totalSize > 10 * 1024 * 1024) {
        setError('Total file size cannot exceed 10MB');
        return;
      }

      setAttachments((prev) => [...prev, ...files]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.reason) {
      setError('Please select a dispute reason');
      return;
    }

    if (!formData.description.trim()) {
      setError('Please provide a description of the dispute');
      return;
    }

    if (!formData.contactEmail) {
      setError('Please provide your email address');
      return;
    }

    try {
      await onSubmit({
        paymentId,
        reason: formData.reason,
        description: formData.description,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      setSuccess(true);
      setFormData({ reason: '', description: '', contactEmail: '', contactPhone: '' });
      setAttachments([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit dispute. Please try again.');
    }
  };

  if (success) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-700 dark:bg-green-900/20">
        <div className="flex gap-3">
          <FileText className="h-6 w-6 flex-shrink-0 text-green-600 dark:text-green-400" />
          <div>
            <h3 className="font-semibold text-green-900 dark:text-green-100">
              Dispute Submitted Successfully
            </h3>
            <p className="mt-1 text-sm text-green-800 dark:text-green-200">
              Your dispute has been filed. You will receive updates at the email address provided.
              Our support team will review your case within 3-5 business days.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
    >
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">File a Dispute</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Submit a dispute for payment ID: <span className="font-mono">{paymentId}</span>
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/20">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Dispute Reason *
        </label>
        <select
          name="reason"
          value={formData.reason}
          onChange={handleInputChange}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        >
          <option value="">Select a reason...</option>
          {disputeReasons.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Description *
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          placeholder="Please explain why you are disputing this payment..."
          rows={4}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Contact Email *
        </label>
        <input
          type="email"
          name="contactEmail"
          value={formData.contactEmail}
          onChange={handleInputChange}
          placeholder="your.email@example.com"
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Contact Phone
        </label>
        <input
          type="tel"
          name="contactPhone"
          value={formData.contactPhone}
          onChange={handleInputChange}
          placeholder="+1 (555) 123-4567"
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Attachments (Optional)
        </label>
        <div className="mt-2">
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-300"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Max 10MB total. Accepted: PDF, images, Word documents
          </p>
        </div>

        {attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {attachments.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-700"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {file.name} ({(file.size / 1024).toFixed(2)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        <Send className="mr-2 h-4 w-4" />
        {isLoading ? 'Submitting...' : 'Submit Dispute'}
      </Button>
    </form>
  );
}
