import { useTranslations } from "next-intl";
import AppointmentsClient from "./AppointmentsClient";

export default function AppointmentsPage() {
  const t = useTranslations("appointments");
  return (
    <AppointmentsClient
      labels={{
        title:       t("title"),
        loading:     t("loading"),
        empty:       t("empty"),
        scheduled:   t("scheduled"),
        confirmed:   t("confirmed"),
        cancelled:   t("cancelled"),
        completed:   t("completed"),
        noShow:      t("noShow"),
        allDoctors:  t("allDoctors"),
        prevWeek:    t("prevWeek"),
        nextWeek:    t("nextWeek"),
        today:       t("today"),
      }}
    />
  );
}
