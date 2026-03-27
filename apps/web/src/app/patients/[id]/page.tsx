import { useTranslations } from "next-intl";
import PatientDetailClient from "./PatientDetailClient";

export default function PatientDetailPage({ params }: { params: { id: string } }) {
  const t = useTranslations("patientDetail");
  return (
    <PatientDetailClient
      patientId={params.id}
      labels={{
        back: t("back"),
        loading: t("loading"),
        error: t("error"),
        details: t("details"),
        encounters: t("encounters"),
        noEncounters: t("noEncounters"),
      }}
    />
  );
}
