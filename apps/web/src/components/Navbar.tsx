import { cookies } from "next/headers";
import { useTranslations } from "next-intl";
import { defaultLocale, type Locale } from "@/lib/locales";
import NavbarClient from "./NavbarClient";

export default async function Navbar() {
  const t = await getTranslations("nav");
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value as Locale) ?? defaultLocale;

  const links = [
    { href: "/patients", label: t("patients") },
    { href: "/encounters", label: t("encounters") },
    { href: "/payments", label: t("payments") },
  ];

  return <NavbarClient links={links} locale={locale} />;
}
