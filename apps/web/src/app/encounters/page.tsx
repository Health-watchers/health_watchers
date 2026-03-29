import { Metadata } from "next";
import EncountersClient from "./EncountersClient";

export const metadata: Metadata = {
  title: "Encounters",
  description: "View and manage patient encounters, clinical notes, and treatment plans.",
};

export default function EncountersPage() {
  return <EncountersClient />;
}
