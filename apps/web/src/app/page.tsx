'use client';

import { useTranslations } from "next-intl";
import { useQuery } from '@tanstack/react-query';
import { StatCard } from '@/components/dashboard/StatCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DashboardStats {
  todayPatients: number;
  openEncounters: number;
  pendingPayments: number;
  totalPatients: number;
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_URL}/api/v1/dashboard/stats`, {
    credentials: 'include',
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch dashboard stats');
  }
  
  const json = await res.json();
  return json.data;
}

export default function HomePage() {
  const t = useTranslations("home");
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  });

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t("title")}</h1>
      <p className="mt-2 text-gray-600">{t("subtitle")}</p>

      <div className="mt-8">
        {isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {t("error")}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={t("stats.todayPatients")}
              value={isLoading ? '…' : (stats?.todayPatients ?? 0)}
              icon="🧑‍⚕️"
              color="blue"
            />
            <StatCard
              title={t("stats.openEncounters")}
              value={isLoading ? '…' : (stats?.openEncounters ?? 0)}
              icon="📋"
              color="green"
            />
            <StatCard
              title={t("stats.pendingPayments")}
              value={isLoading ? '…' : (stats?.pendingPayments ?? 0)}
              icon="💳"
              color="yellow"
            />
            <StatCard
              title={t("stats.totalPatients")}
              value={isLoading ? '…' : (stats?.totalPatients ?? 0)}
              icon="👥"
              color="indigo"
            />
          </div>
        )}
      </div>
    </main>
  );
}
