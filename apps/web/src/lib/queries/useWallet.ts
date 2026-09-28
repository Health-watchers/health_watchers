import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface WalletBalance {
  publicKey: string;
  balances: Array<{ asset: string; balance: string; assetCode?: string; assetIssuer?: string }>;
  federationAddress?: string;
}

export interface BalanceSnapshot {
  date: string;
  xlm: number;
  usd?: number;
}

export function useWalletBalance() {
  return useQuery<WalletBalance>({
    queryKey: queryKeys.wallet.balance(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API}/wallet/balance`);
      if (!res.ok) throw new Error(`Failed to load wallet balance (${res.status})`);
      const data = await res.json();
      return data.data ?? data;
    },
  });
}

export function useWalletSnapshots() {
  return useQuery<BalanceSnapshot[]>({
    queryKey: queryKeys.wallet.snapshots(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API}/wallet/snapshots`);
      if (!res.ok) throw new Error(`Failed to load balance history (${res.status})`);
      const data = await res.json();
      return data.data ?? [];
    },
  });
}
