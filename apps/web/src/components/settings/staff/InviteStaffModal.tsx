'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { InviteStaffSchema, type InviteStaffInput, type StaffRole } from '@health-watchers/types';
import { Modal, Input, Select, Button, toast } from '@/components/ui';
import { useInviteStaff } from '@/lib/queries/useStaff';

interface InviteStaffModalProps {
  open: boolean;
  onClose: () => void;
  /** Roles the current admin is allowed to assign. */
  assignableRoles: readonly StaffRole[];
}

export function InviteStaffModal({ open, onClose, assignableRoles }: InviteStaffModalProps) {
  const t = useTranslations('staff');
  const invite = useInviteStaff();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteStaffInput>({
    resolver: zodResolver(InviteStaffSchema),
    defaultValues: { fullName: '', email: '', role: assignableRoles[0] ?? 'READ_ONLY' },
  });

  const close = () => {
    reset();
    invite.reset();
    onClose();
  };

  const onSubmit = async (values: InviteStaffInput) => {
    try {
      await invite.mutateAsync(values);
      toast.success(t('invite.success', { email: values.email }));
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('invite.error'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('invite.title')}
      description={t('invite.description')}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input
          id="invite-full-name"
          label={t('invite.fullName')}
          autoComplete="name"
          {...(errors.fullName && { error: t('invite.errors.fullName') })}
          {...register('fullName')}
        />
        <Input
          id="invite-email"
          type="email"
          label={t('invite.email')}
          autoComplete="email"
          {...(errors.email && { error: t('invite.errors.email') })}
          {...register('email')}
        />
        <Select
          id="invite-role"
          label={t('invite.role')}
          options={assignableRoles.map((role) => ({ value: role, label: t(`roles.${role}`) }))}
          {...(errors.role && { error: t('invite.errors.role') })}
          {...register('role')}
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" loading={invite.isPending}>
            {t('invite.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
