import { ErrorBoundary } from '@/components/ui/error-boundary';
import { RealtimeProvider } from '@/components/RealtimeProvider';
import AppLayout from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <RealtimeProvider>
        <AppLayout>
          <div id="main-content" tabIndex={-1}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </AppLayout>
      </RealtimeProvider>
    </ProtectedRoute>
  );
}
