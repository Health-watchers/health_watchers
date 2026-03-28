import { Metadata } from "next-intl";
import { useTranslations } from "next-intl";

export const metadata = {
  title: "Dashboard",
  description: "Overview of your healthcare dashboard - recent patients, upcoming appointments, and system status.",
};

export default function HomePage() {
  const t = useTranslations("home");
  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t("title")}</h1>
      <p className="mt-2 text-gray-600">{t("subtitle")}</p>
    </main>
  );
}
