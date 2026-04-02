"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SubNavigation } from "@/components/settings/SubNavigation";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { SecuritySection } from "@/components/settings/SecuritySection";
import { PreferencesSection } from "@/components/settings/PreferencesSection";

type Section = "profile" | "security" | "preferences";

interface MeResponse {
  status: "success";
  data: {
    fullName: string;
    email: string;
    role: string;
    clinic: string;
    mfaEnabled: boolean;
    preferences: {
      language: string;
      emailNotifications: boolean;
      inAppNotifications: boolean;
    };
  };
}

async function fetchMe(): Promise<MeResponse["data"]> {
  const res = await fetch("/api/settings/me");
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  const body: MeResponse = await res.json();
  return body.data;
}

export default function SettingsClient() {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<Section>("profile");

  const { data, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-danger-500">
        {error instanceof Error ? error.message : "Failed to load settings."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-neutral-900 mb-8">Settings</h1>
      <div className="flex gap-8">
        <aside className="w-48 shrink-0">
          <SubNavigation active={active} onChange={setActive} />
        </aside>
        <main className="flex-1 min-w-0">
          {active === "profile" && (
            <ProfileSection
              user={{
                fullName: data.fullName,
                email: data.email,
                role: data.role,
                clinic: data.clinic,
              }}
            />
          )}
          {active === "security" && (
            <SecuritySection
              mfaEnabled={data.mfaEnabled}
              onMfaStatusChange={() =>
                queryClient.invalidateQueries({ queryKey: ["me"] })
              }
            />
          )}
          {active === "preferences" && (
            <PreferencesSection preferences={data.preferences} />
          )}
        </main>
      </div>
    </div>
  );
}
