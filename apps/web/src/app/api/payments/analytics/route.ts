import { NextRequest, NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';

/**
 * GET /api/payments/analytics
 *
 * Proxies to the backend analytics endpoint and enriches the response with
 * any missing KPI fields (outstanding, refunded, disputed, topDiagnosesByRevenue,
 * encounterPaymentLinks) so the frontend always has a consistent shape.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('accessToken')?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const upstream = new URL(`${API_URL}/api/v1/payments/analytics`);
  searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

  const res = await fetch(upstream.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Upstream error' }));
    return NextResponse.json(errBody, { status: res.status });
  }

  const body = await res.json();

  // Normalise data shape — add new KPI fields if the backend hasn't added them yet
  const data = body.data ?? body;

  const normalised = {
    ...data,
    // New KPI fields — fall back to computed values from legacy fields when absent
    totalCollected: data.totalCollected ?? data.totalRevenue?.usdEquivalent ?? '0',
    totalOutstanding: data.totalOutstanding ?? '0',
    totalRefunded: data.totalRefunded ?? '0',
    totalDisputed: data.totalDisputed ?? '0',
    // New chart data — default to empty arrays if backend hasn't supplied them
    topDiagnosesByRevenue: data.topDiagnosesByRevenue ?? [],
    encounterPaymentLinks: data.encounterPaymentLinks ?? [],
  };

  // Re-wrap in the same envelope shape the backend uses
  if ('data' in body) {
    return NextResponse.json({ ...body, data: normalised }, { status: res.status });
  }
  return NextResponse.json(normalised, { status: res.status });
}
