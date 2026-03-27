'use client';

import { useState, useEffect } from 'react';
import { PageWrapper, PageHeader, Card, CardContent } from '@/components/ui';
import { getStellarExplorerUrl } from '@/lib/stellar';

interface Payment {
  id: string;
  patientId: string;
  amount: string;
  status: string;
  txHash?: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/v1/payments')
      .then(res => res.json())
      .then(data => { setPayments(data || []); setLoading(false); })
      .catch(err => { console.error(err); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <PageWrapper className="py-8">
        <div className="flex items-center justify-center">
          <p className="text-secondary-600">Loading payments...</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="py-8">
      <PageHeader title="Payments (Stellar)" />
      <div className="space-y-4">
        {payments.map(payment => (
          <Card key={payment.id}>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-4 text-sm">
                <div><span className="font-medium text-secondary-900">ID:</span>{' '}<span className="font-mono text-secondary-700">{payment.id}</span></div>
                <div><span className="font-medium text-secondary-900">Patient:</span>{' '}<span className="text-secondary-700">{payment.patientId}</span></div>
                <div><span className="font-medium text-secondary-900">Amount:</span>{' '}<span className="text-secondary-700">{payment.amount} XLM</span></div>
                <div>
                  <span className="font-medium text-secondary-900">Status:</span>{' '}
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    payment.status === 'completed' ? 'bg-success-100 text-success-800'
                    : payment.status === 'pending' ? 'bg-warning-100 text-warning-800'
                    : 'bg-secondary-100 text-secondary-800'
                  }`}>{payment.status}</span>
                </div>
              </div>
              {payment.txHash && (
                <div className="pt-2">
                  <span className="font-medium text-secondary-900">Transaction:</span>{' '}
                  <a href={getStellarExplorerUrl(payment.txHash, process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet')} target="_blank" rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-md px-1 py-0.5 transition-colors">
                    View on Stellar Expert
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {payments.length === 0 && (
          <div className="text-center py-8">
            <p className="text-secondary-600">No payments found. Connect Stellar service.</p>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
