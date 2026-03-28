import { Metadata } from "next";
import PaymentsClient from "./PaymentsClient";

export const metadata: Metadata = {
  title: "Payments",
  description: "Manage payments, billing, and transaction history for healthcare services.",
};

export default function PaymentsPage() {
  return <PaymentsClient />;
}
