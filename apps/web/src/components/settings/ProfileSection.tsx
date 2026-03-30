"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const profileSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(100),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export interface UserProfile {
  fullName: string;
  email: string;
  role: string;
  clinic: string;
}

export interface ProfileSectionProps {
  user: UserProfile;
}

export function ProfileSection({ user }: ProfileSectionProps) {
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
    reset,
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: user.fullName },
  });

  const onSubmit = async (data: ProfileFormData) => {
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: data.fullName }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? "Failed to update profile");
      }

      await queryClient.invalidateQueries({ queryKey: ["me"] });
      reset({ fullName: data.fullName });
      setSuccessMessage("Profile updated successfully");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Profile</h2>
        <p className="text-sm text-neutral-500">Update your display name.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md">
        <Input
          label="Full Name"
          {...register("fullName")}
          error={errors.fullName?.message}
          disabled={isSubmitting}
        />

        {/* Read-only fields */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">Email</label>
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            {user.email}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">Role</label>
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            {user.role}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-neutral-700">Clinic</label>
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            {user.clinic}
          </p>
        </div>

        {successMessage && (
          <p className="text-sm text-green-600">{successMessage}</p>
        )}

        {errorMessage && (
          <p className="text-sm text-danger-500">{errorMessage}</p>
        )}

        {isDirty && (
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
            Save
          </Button>
        )}
      </form>
    </div>
  );
}
