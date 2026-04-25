'use client';

import { useEffect, useState } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ClaimableBalanceStatusProps {
  balanceId: string;
  onClaim?: () => void;
}

interface BalanceData {
  claimableBalanceId: string;
  amount: string;
  claimableAfter: string;
  claimableUntil: string;
  claimed: boolean;
  claimedAt?: string;
  status: 'pending' | 'claimable' | 'claimed' | 'expired';
}

export function ClaimableBalanceStatus({ balanceId, onClaim }: ClaimableBalanceStatusProps) {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBalance();
  }, [balanceId]);

  const fetchBalance = async () => {
    try {
      const response = await fetch(`/api/v1/payments/claimable/${balanceId}`);
      const data = await response.json();

      if (response.ok) {
        setBalance(data.data);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    setError('');

    try {
      const response = await fetch(`/api/v1/payments/claim/${balanceId}`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to claim balance');
      }

      await fetchBalance();
      onClaim?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading...</div>;
  }

  if (!balance) {
    return <div className="text-center py-4 text-red-600">{error || 'Balance not found'}</div>;
  }

  const getStatusIcon = () => {
    switch (balance.status) {
      case 'pending':
        return <Clock className="w-6 h-6 text-yellow-500" />;
      case 'claimable':
        return <AlertCircle className="w-6 h-6 text-blue-500" />;
      case 'claimed':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'expired':
        return <XCircle className="w-6 h-6 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (balance.status) {
      case 'pending':
        return 'Pending - Not yet claimable';
      case 'claimable':
        return 'Claimable - Ready to claim';
      case 'claimed':
        return 'Claimed';
      case 'expired':
        return 'Expired - Funds returned to patient';
    }
  };

  const canClaim = balance.status === 'claimable' && !balance.claimed;

  return (
    <div className="border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-3">
        {getStatusIcon()}
        <div>
          <h4 className="font-semibold text-lg">Escrow Payment</h4>
          <p className="text-sm text-gray-600">{getStatusText()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-600">Amount:</span>
          <span className="ml-2 font-medium">{balance.amount} XLM</span>
        </div>
        <div>
          <span className="text-gray-600">Balance ID:</span>
          <span className="ml-2 font-mono text-xs">{balance.claimableBalanceId.slice(0, 16)}...</span>
        </div>
        <div>
          <span className="text-gray-600">Claimable After:</span>
          <span className="ml-2">{new Date(balance.claimableAfter).toLocaleString()}</span>
        </div>
        <div>
          <span className="text-gray-600">Expires:</span>
          <span className="ml-2">{new Date(balance.claimableUntil).toLocaleString()}</span>
        </div>
      </div>

      {balance.claimed && balance.claimedAt && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">
            Claimed on {new Date(balance.claimedAt).toLocaleString()}
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {canClaim && (
        <button
          onClick={handleClaim}
          disabled={claiming}
          className="w-full md:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors min-h-[44px]"
        >
          {claiming ? 'Claiming...' : 'Claim Balance'}
        </button>
      )}
    </div>
  );
}
