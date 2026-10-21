'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import type { StaffMember, StaffRole } from '@health-watchers/types';
import { SlideOver, Select, Button, Badge, toast } from '@/components/ui';
import {
  useUpdateStaffRole,
  useSetStaffActive,
  useRevokeStaffSessions,
  useForceStaffPasswordReset,
} from '@/lib/queries/useStaff';

type ConfirmableAction = 'deactivate' | 'revokeSessions' | 'resetPassword';

interface StaffDetailSlideOverProps {
  member: StaffMember | null;
  onClose: () => void;
  /** Roles the current admin is allowed to assign. */
  assignableRoles: readonly StaffRole[];
  /** False when the current admin may not manage this member (e.g. a peer admin). */
  canManage: boolean;
  isSelf: boolean;
}

export function StaffDetailSlideOver({
  member,
  onClose,
  assignableRoles,
  canManage,
  isSelf,
}: StaffDetailSlideOverProps) {
  const t = useTranslations('staff');
  const format = useFormatter();
  const [role, setRole] = useState<StaffRole | ''>('');
  const [confirming, setConfirming] = useState<ConfirmableAction | null>(null);

  const updateRole = useUpdateStaffRole();
  const setActive = useSetStaffActive();
  const revokeSessions = useRevokeStaffSessions();
  const resetPassword = useForceStaffPasswordReset();

  useEffect(() => {
    setRole(member?.role ?? '');
    setConfirming(null);
  }, [member?.id, member?.role]);

  if (!member) return null;

  const errorMessage = (err: unknown) => (err instanceof Error ? err.message : t('actions.error'));

  const saveRole = () => {
    if (!role || role === member.role) return;
    updateRole.mutate(
      { id: member.id, role },
      {
        onSuccess: () => toast.success(t('detail.roleUpdated', { role: t(`roles.${role}`) })),
        onError: (err) => {
          setRole(member.role);
          toast.error(errorMessage(err));
        },
      }
    );
  };

  const runConfirmed = (action: ConfirmableAction) => {
    setConfirming(null);
    if (action === 'deactivate') {
      setActive.mutate(
        { id: member.id, active: false },
        {
          onSuccess: () => toast.success(t('detail.deactivated', { name: member.fullName })),
          onError: (err) => toast.error(errorMessage(err)),
        }
      );
    } else if (action === 'revokeSessions') {
      revokeSessions.mutate(member.id, {
        onSuccess: (res) =>
          toast.success(t('detail.sessionsRevoked', { count: res.data?.revoked ?? 0 })),
        onError: (err) => toast.error(errorMessage(err)),
      });
    } else {
      resetPassword.mutate(member.id, {
        onSuccess: () => toast.success(t('detail.passwordResetSent', { email: member.email })),
        onError: (err) => toast.error(errorMessage(err)),
      });
    }
  };

  const reactivate = () =>
    setActive.mutate(
      { id: member.id, active: true },
      {
        onSuccess: () => toast.success(t('detail.reactivated', { name: member.fullName })),
        onError: (err) => toast.error(errorMessage(err)),
      }
    );

  // Keep the member's current role selectable even if the admin can't assign it
  const roleOptions = [...new Set<StaffRole>([member.role, ...assignableRoles])].map((r) => ({
    value: r,
    label: t(`roles.${r}`),
  }));

  const confirmCopy: Record<ConfirmableAction, { prompt: string; confirm: string }> = {
    deactivate: { prompt: t('detail.confirmDeactivate'), confirm: t('actions.deactivate') },
    revokeSessions: { prompt: t('detail.confirmRevoke'), confirm: t('actions.revokeSessions') },
    resetPassword: { prompt: t('detail.confirmReset'), confirm: t('actions.resetPassword') },
  };

  return (
    <SlideOver
      isOpen
      onClose={onClose}
      title={member.fullName}
      subtitle={member.email}
      width="w-full sm:w-[28rem]"
    >
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt className="text-neutral-500">{t('columns.status')}</dt>
          <dd>
            <Badge variant={member.isActive ? 'success' : 'default'}>
              {member.isActive ? t('status.active') : t('status.inactive')}
            </Badge>
          </dd>
          <dt className="text-neutral-500">{t('detail.mfa')}</dt>
          <dd>{member.mfaEnabled ? t('detail.enabled') : t('detail.disabled')}</dd>
          <dt className="text-neutral-500">{t('detail.emailVerified')}</dt>
          <dd>{member.emailVerified ? t('detail.yes') : t('detail.no')}</dd>
          <dt className="text-neutral-500">{t('columns.joined')}</dt>
          <dd>{format.dateTime(new Date(member.createdAt), { dateStyle: 'medium' })}</dd>
        </dl>

        {!canManage && (
          <p className="rounded-md bg-neutral-100 p-3 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {isSelf ? t('detail.selfNotice') : t('detail.readOnlyNotice')}
          </p>
        )}

        <section aria-labelledby="staff-role-heading" className="flex flex-col gap-2">
          <h3
            id="staff-role-heading"
            className="text-sm font-semibold text-neutral-800 dark:text-neutral-100"
          >
            {t('detail.roleHeading')}
          </h3>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                id="staff-role"
                aria-label={t('columns.role')}
                value={role}
                options={roleOptions}
                disabled={!canManage || updateRole.isPending}
                onChange={(e) => setRole(e.target.value as StaffRole)}
              />
            </div>
            <Button
              onClick={saveRole}
              disabled={!canManage || !role || role === member.role}
              loading={updateRole.isPending}
            >
              {t('actions.saveRole')}
            </Button>
          </div>
        </section>

        <section aria-labelledby="staff-access-heading" className="flex flex-col gap-2">
          <h3
            id="staff-access-heading"
            className="text-sm font-semibold text-neutral-800 dark:text-neutral-100"
          >
            {t('detail.accessHeading')}
          </h3>

          {confirming ? (
            <div
              role="alertdialog"
              aria-labelledby="staff-confirm-text"
              className="border-danger-200 bg-danger-50 dark:border-danger-800 dark:bg-danger-900/30 rounded-md border p-3"
            >
              <p
                id="staff-confirm-text"
                className="text-danger-700 dark:text-danger-300 mb-3 text-sm"
              >
                {confirmCopy[confirming].prompt}
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>
                  {t('actions.cancel')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => runConfirmed(confirming)}>
                  {confirmCopy[confirming].confirm}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {member.isActive ? (
                <Button
                  variant="danger"
                  disabled={!canManage}
                  loading={setActive.isPending}
                  onClick={() => setConfirming('deactivate')}
                >
                  {t('actions.deactivate')}
                </Button>
              ) : (
                <Button disabled={!canManage} loading={setActive.isPending} onClick={reactivate}>
                  {t('actions.reactivate')}
                </Button>
              )}
              <Button
                variant="outline"
                disabled={!canManage}
                loading={revokeSessions.isPending}
                onClick={() => setConfirming('revokeSessions')}
              >
                {t('actions.revokeSessions')}
              </Button>
              <Button
                variant="outline"
                disabled={!canManage}
                loading={resetPassword.isPending}
                onClick={() => setConfirming('resetPassword')}
              >
                {t('actions.resetPassword')}
              </Button>
            </div>
          )}
        </section>
      </div>
    </SlideOver>
  );
}
