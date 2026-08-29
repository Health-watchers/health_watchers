'use client';

import { useState, useEffect } from 'react';
import { Toast } from '@/components/ui';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: 'service' | 'procedure' | 'medication' | 'equipment';
}

interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_transfer';
  last4?: string;
  holderName?: string;
  expiryDate?: string;
  bankName?: string;
  accountType?: string;
}

interface PaymentPlan {
  id: string;
  name: string;
  totalPayments: number;
  amountPerPayment: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
  description: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  patientName: string;
  patientId: string;
  dateIssued: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  notes?: string;
}

interface PaymentHistory {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  status: 'pending' | 'completed' | 'failed';
  reference: string;
}

interface InvoicePaymentInterfaceProps {
  invoice: Invoice;
  paymentMethods?: PaymentMethod[];
  onPaymentSubmit: (payment: { amount: number; methodId: string; notes?: string }) => Promise<void>;
  onSetupRecurring: (plan: PaymentPlan) => Promise<void>;
  onCancel: () => void;
}

const PAYMENT_PLANS: PaymentPlan[] = [
  {
    id: 'half-half',
    name: '50/50 Split Payment',
    totalPayments: 2,
    amountPerPayment: 0.5,
    frequency: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    description: 'Split payment into 2 equal installments',
  },
  {
    id: 'three-way',
    name: '3-Way Payment Plan',
    totalPayments: 3,
    amountPerPayment: 0.33,
    frequency: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    description: 'Distribute payment across 3 months',
  },
  {
    id: 'custom',
    name: 'Custom Plan',
    totalPayments: 0,
    amountPerPayment: 0,
    frequency: 'monthly',
    startDate: new Date().toISOString().split('T')[0],
    description: 'Create your own payment plan',
  },
];

export function InvoicePaymentInterface({
  invoice,
  paymentMethods = [],
  onPaymentSubmit,
  onSetupRecurring,
  onCancel,
}: InvoicePaymentInterfaceProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'payment' | 'history' | 'plans'>(
    'details'
  );
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>(
    paymentMethods[0]?.id || ''
  );
  const [paymentAmount, setPaymentAmount] = useState(invoice.total.toString());
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [customPlanPayments, setCustomPlanPayments] = useState('3');
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [insuranceVerifying, setInsuranceVerifying] = useState(false);
  const [insuranceStatus, setInsuranceStatus] = useState<
    'idle' | 'verified' | 'pending' | 'failed'
  >('idle');

  useEffect(() => {
    // Simulate loading payment history
    setPaymentHistory([
      {
        id: '1',
        amount: 500,
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        method: { id: '1', type: 'card', last4: '4242' },
        status: 'completed',
        reference: 'TXN-2024-001',
      },
    ]);
  }, []);

  const remainingBalance = invoice.total - paymentHistory.reduce((sum, p) => sum + p.amount, 0);
  const paidAmount = paymentHistory.reduce(
    (sum, p) => sum + (p.status === 'completed' ? p.amount : 0),
    0
  );

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentMethod) {
      setToast({ message: 'Please select a payment method', type: 'error' });
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setToast({ message: 'Please enter a valid payment amount', type: 'error' });
      return;
    }

    if (amount > remainingBalance) {
      setToast({
        message: `Payment amount exceeds remaining balance of $${remainingBalance.toFixed(2)}`,
        type: 'error',
      });
      return;
    }

    try {
      setIsProcessing(true);
      await onPaymentSubmit({
        amount,
        methodId: selectedPaymentMethod,
        notes: paymentNotes,
      });

      setToast({ message: 'Payment processed successfully', type: 'success' });
      setPaymentAmount('');
      setPaymentNotes('');
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Payment failed',
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetupPlan = async (planId: string) => {
    const plan = PAYMENT_PLANS.find((p) => p.id === planId);
    if (!plan) return;

    let finalPlan = plan;
    if (planId === 'custom') {
      const payments = parseInt(customPlanPayments);
      if (isNaN(payments) || payments <= 0) {
        setToast({ message: 'Please enter valid number of payments', type: 'error' });
        return;
      }
      finalPlan = {
        ...plan,
        totalPayments: payments,
        amountPerPayment: invoice.total / payments,
      };
    }

    try {
      setIsProcessing(true);
      await onSetupRecurring(finalPlan);
      setToast({ message: 'Payment plan setup successfully', type: 'success' });
      setSelectedPlan('');
    } catch (error) {
      setToast({
        message: error instanceof Error ? error.message : 'Failed to setup plan',
        type: 'error',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyInsurance = async () => {
    try {
      setInsuranceVerifying(true);
      setInsuranceStatus('pending');
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setInsuranceStatus('verified');
      setToast({ message: 'Insurance verification successful', type: 'success' });
    } catch {
      setInsuranceStatus('failed');
      setToast({ message: 'Insurance verification failed', type: 'error' });
    } finally {
      setInsuranceVerifying(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'overdue':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'sent':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-start justify-between border-b border-gray-200 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Invoice</h2>
          <p className="text-sm text-gray-600">Invoice #{invoice.invoiceNumber}</p>
          <p className="mt-1 text-xs text-gray-500">
            Patient: {invoice.patientName} (ID: {invoice.patientId})
          </p>
        </div>

        <div className="text-right">
          <div
            className={`inline-block rounded-full border px-4 py-2 text-sm font-semibold ${getStatusBadgeColor(
              invoice.status
            )}`}
          >
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </div>
          <p className="mt-2 text-sm font-medium text-gray-900">
            Amount Due:{' '}
            <span className="text-2xl text-blue-600">${remainingBalance.toFixed(2)}</span>
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {(['details', 'payment', 'history', 'plans'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}

      {/* Invoice Details */}
      {activeTab === 'details' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-600">Issued Date</p>
              <p className="text-sm font-medium text-gray-900">{invoice.dateIssued}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-gray-600">Due Date</p>
              <p className="text-sm font-medium text-gray-900">{invoice.dueDate}</p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 text-left font-semibold text-gray-900">Description</th>
                  <th className="py-2 text-right font-semibold text-gray-900">Qty</th>
                  <th className="py-2 text-right font-semibold text-gray-900">Unit Price</th>
                  <th className="py-2 text-right font-semibold text-gray-900">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-3">
                      <p className="font-medium text-gray-900">{item.description}</p>
                      <p className="text-xs capitalize text-gray-500">{item.category}</p>
                    </td>
                    <td className="py-3 text-right text-gray-600">{item.quantity}</td>
                    <td className="py-3 text-right text-gray-600">${item.unitPrice.toFixed(2)}</td>
                    <td className="py-3 text-right font-medium text-gray-900">
                      ${item.total.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
              <div className="flex justify-end gap-4">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium text-gray-900">${invoice.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-end gap-4">
                <span className="text-gray-600">Tax:</span>
                <span className="font-medium text-gray-900">${invoice.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-end gap-4 border-t border-gray-200 pt-2">
                <span className="font-semibold text-gray-900">Total:</span>
                <span className="text-lg font-bold text-blue-600">${invoice.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Amount Paid:</span>
              <span className="font-medium text-gray-900">${paidAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Remaining Balance:</span>
              <span className="font-medium text-red-600">${remainingBalance.toFixed(2)}</span>
            </div>
          </div>

          {invoice.notes && (
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-gray-600">Notes</p>
              <p className="text-sm text-gray-700">{invoice.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Payment Processing */}
      {activeTab === 'payment' && (
        <form onSubmit={handlePayment} className="space-y-4">
          {/* Insurance Verification */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-blue-900">Insurance Verification</h3>
              <button
                type="button"
                onClick={handleVerifyInsurance}
                disabled={insuranceVerifying}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  insuranceStatus === 'verified'
                    ? 'bg-green-100 text-green-700'
                    : insuranceStatus === 'failed'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {insuranceVerifying
                  ? 'Verifying...'
                  : insuranceStatus === 'verified'
                    ? '✓ Verified'
                    : insuranceStatus === 'failed'
                      ? '✗ Failed'
                      : 'Verify Insurance'}
              </button>
            </div>
            <p className="text-sm text-blue-800">
              Verify insurance coverage before payment to ensure eligibility and coverage limits.
            </p>
          </div>

          {/* Payment Method Selection */}
          <div>
            <label className="mb-3 block text-sm font-semibold text-gray-900">
              Select Payment Method
            </label>

            {paymentMethods.length > 0 ? (
              <div className="space-y-2">
                {paymentMethods.map((method) => (
                  <label
                    key={method.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name="payment-method"
                      value={method.id}
                      checked={selectedPaymentMethod === method.id}
                      onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                      className="h-4 w-4"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {method.type === 'card'
                          ? `Card ending in ${method.last4}`
                          : `${method.bankName} - ${method.accountType}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {method.holderName || method.accountType}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-sm text-gray-500">No payment methods added yet</p>
            )}

            <button
              type="button"
              onClick={() => setShowAddPaymentMethod(!showAddPaymentMethod)}
              className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              + Add Payment Method
            </button>

            {showAddPaymentMethod && (
              <div className="mt-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-900">
                    Card Number
                  </label>
                  <input
                    type="text"
                    placeholder="1234 5678 9012 3456"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-900">Expiry</label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-900">CVV</label>
                    <input
                      type="text"
                      placeholder="123"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment Amount */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-900">Payment Amount</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 text-gray-600">$</span>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  step="0.01"
                  max={remainingBalance}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pl-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
              <button
                type="button"
                onClick={() => setPaymentAmount(remainingBalance.toString())}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Pay Full
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Remaining balance: ${remainingBalance.toFixed(2)}
            </p>
          </div>

          {/* Payment Notes */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-900">Notes (Optional)</label>
            <textarea
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add any payment notes..."
              rows={3}
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing || !selectedPaymentMethod}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isProcessing
                ? 'Processing...'
                : `Pay $${parseFloat(paymentAmount || '0').toFixed(2)}`}
            </button>
          </div>
        </form>
      )}

      {/* Payment History */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {paymentHistory.length > 0 ? (
            <div className="space-y-2">
              {paymentHistory.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">${payment.amount.toFixed(2)}</p>
                    <p className="mt-1 text-xs text-gray-600">
                      {payment.method.type === 'card'
                        ? `Card ending in ${payment.method.last4}`
                        : `${payment.method.bankName}`}
                    </p>
                    <p className="text-xs text-gray-500">Ref: {payment.reference}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">{payment.date}</p>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                        payment.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : payment.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-gray-500">No payment history yet</p>
          )}
        </div>
      )}

      {/* Payment Plans */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Set up a payment plan to distribute the invoice amount over multiple payments.
          </p>

          <div className="space-y-3">
            {PAYMENT_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
                  selectedPlan === plan.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedPlan(selectedPlan === plan.id ? '' : plan.id)}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{plan.name}</p>
                    <p className="text-sm text-gray-600">{plan.description}</p>
                  </div>
                  <input
                    type="radio"
                    name="payment-plan"
                    checked={selectedPlan === plan.id}
                    onChange={() => setSelectedPlan(plan.id)}
                    className="h-4 w-4"
                  />
                </div>

                {selectedPlan === plan.id && plan.id === 'custom' && (
                  <div className="mt-3 border-t border-gray-300 pt-3">
                    <label className="mb-2 block text-xs font-medium text-gray-700">
                      Number of Payments
                    </label>
                    <input
                      type="number"
                      value={customPlanPayments}
                      onChange={(e) => setCustomPlanPayments(e.target.value)}
                      min="2"
                      max="12"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                )}

                {selectedPlan === plan.id && plan.id !== 'custom' && (
                  <p className="mt-2 text-sm font-medium text-blue-700">
                    ${(plan.amountPerPayment * invoice.total).toFixed(2)} every {plan.frequency}
                  </p>
                )}

                {selectedPlan === plan.id && (
                  <button
                    onClick={() => handleSetupPlan(plan.id)}
                    disabled={isProcessing}
                    className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isProcessing ? 'Setting up...' : 'Setup Payment Plan'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
