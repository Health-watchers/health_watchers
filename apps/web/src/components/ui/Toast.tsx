'use client';

export function Toast({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

export function Toaster() {
  return null;
}

export const toast = {
  success: (message: string) => console.log('[toast:success]', message),
  error: (message: string) => console.error('[toast:error]', message),
};
