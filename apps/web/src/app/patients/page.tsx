import { useTranslations } from "next-intl";
import PatientsClient from "./PatientsClient";

export default function PatientsPage() {
  const t = useTranslations("patients");
  return (
    <PatientsClient
      labels={{
        title: t("title"),
        loading: t("loading"),
        empty: t("empty"),
        id: t("id"),
        name: t("name"),
        dob: t("dob"),
        sex: t("sex"),
        contact: t("contact"),
        search: t("search"),
        view: t("view"),
      }}
    />
  );
}
