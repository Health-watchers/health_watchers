"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { locales, type Locale } from "@/lib/locales";

const labels: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

export default function LanguageSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchLocale(locale: Locale) {
    document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;
    startTransition(() => router.refresh());
  }

  return (
    <div role="group" aria-label="Language selection" className="flex gap-2 items-center">
      {locales.map((locale) => {
        const isCurrent = locale === current;
        return (
          <button
            key={locale}
            onClick={() => switchLocale(locale)}
            disabled={isCurrent || isPending}
            aria-pressed={isCurrent}
            aria-label={`Switch language to ${labels[locale]}`}
            className={`px-3 py-1 text-sm rounded border transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 ${
              isCurrent
                ? "bg-gray-200 border-gray-300 font-semibold cursor-default"
                : "bg-white border-gray-300 hover:bg-gray-50 cursor-pointer"
            }`}
          >
            {labels[locale]}
          </button>
        );
      })}
    </div>
  );
}
