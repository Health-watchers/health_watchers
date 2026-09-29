import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { fetchWithAuth } from '@/lib/auth';
import { API_V1 } from '@/lib/api';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  patientId: { firstName: string; lastName: string; systemId: string } | null;
  total: string;
  currency: string;
  status: InvoiceStatus;
  dueDate: string;
  createdAt: string;
}

export function useInvoices() {
  return useQuery<Invoice[]>({
    queryKey: queryKeys.invoices.list(),
    queryFn: async () => {
      const res = await fetchWithAuth(`${API_V1}/invoices`);
      if (!res.ok) throw new Error(`Failed to load invoices (${res.status})`);
      const data = await res.json();
      return data.data ?? [];
    },
  });
}

export function useSendInvoice() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetchWithAuth(`${API_V1}/invoices/${id}/send`, { method: 'POST' });
      if (!res.ok) throw new Error(`Failed to send invoice (${res.status})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
    },
  });
}
