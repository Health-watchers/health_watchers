import { useQuery } from '@tanstack/react-query';

export interface FeeTier {
  stroops: string;
  xlm: string;
  confirmationTime: string;
}

export interface FeeEstimate {
  slow: FeeTier;
  standard: FeeTier;
  fast: FeeTier;
  raw: Record<string, string>;
}

async function fetchFeeEstimate(): Promise<FeeEstimate> {
  const res = await fetch('/api/payments/fee-estimate');
  if (!res.ok) throw new Error(`Fee estimate unavailable (${res.status})`);
  const body = await res.json();
  return body.data;
}

export function useFeeEstimate() {
  return useQuery<FeeEstimate>({
    queryKey: ['payments', 'fee-estimate'],
    queryFn: fetchFeeEstimate,
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
  });
}
