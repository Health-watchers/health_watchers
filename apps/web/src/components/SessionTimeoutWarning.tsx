'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_TIME_MS = 2 * 60 * 1000;

export function SessionTimeoutWarning() {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(WARNING_TIME_MS / 1000);

  useEffect(() => {
    let idleTimer: NodeJS.Timeout;
    let warningTimer: NodeJS.Timeout;
    let countdownInterval: NodeJS.Timeout;

    const resetTimers = () => {
      clearTimeout(idleTimer);
      clearTimeout(warningTimer);
      clearInterval(countdownInterval);
      setShowWarning(false);
      setTimeLeft(WARNING_TIME_MS / 1000);

      idleTimer = setTimeout(() => {
        warningTimer = setTimeout(() => {
          setShowWarning(true);
          let remaining = WARNING_TIME_MS / 1000;
          countdownInterval = setInterval(() => {
            remaining -= 1;
            setTimeLeft(remaining);
            if (remaining <= 0) {
              clearInterval(countdownInterval);
              handleLogout();
            }
          }, 1000);
        }, IDLE_TIMEOUT_MS - WARNING_TIME_MS);
      }, 0);
    };

    const handleUserActivity = () => {
      resetTimers();
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => {
      document.addEventListener(event, handleUserActivity);
    });

    resetTimers();

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleUserActivity);
      });
      clearTimeout(idleTimer);
      clearTimeout(warningTimer);
      clearInterval(countdownInterval);
    };
  }, []);

  const handleLogout = () => {
    setShowWarning(false);
    router.push('/login?session=expired');
  };

  const handleContinue = () => {
    setShowWarning(false);
  };

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-800">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          Session Timeout Warning
        </h2>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Your session will expire in <span className="font-bold">{timeLeft} seconds</span> due to
          inactivity. Click continue to stay logged in.
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={handleLogout}
            className="flex-1"
          >
            Sign out
          </Button>
          <Button
            variant="primary"
            onClick={handleContinue}
            className="flex-1"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
