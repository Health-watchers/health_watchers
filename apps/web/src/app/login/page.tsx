import { Metadata } from "next";
import LoginClient from "./LoginClient";

export const metadata: Metadata = {
  title: "Login",
  description: "Sign in to your Health Watchers account to access your medical records.",
};

export default function LoginPage() {
  return <LoginClient />;
}
