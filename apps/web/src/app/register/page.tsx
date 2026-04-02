import { Metadata } from "next";
import RegisterClient from "./RegisterClient";

export const metadata: Metadata = {
  title: "Register",
  description: "Create a new Health Watchers account to start managing healthcare records.",
};

export default function RegisterPage() {
  return <RegisterClient />;
}
