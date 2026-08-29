export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-900 transition-colors duration-300">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
