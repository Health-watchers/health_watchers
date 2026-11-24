'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import {
  STAFF_ROLES,
  CLINIC_ADMIN_ASSIGNABLE_ROLES,
  type StaffMember,
  type StaffRole,
} from '@health-watchers/types';
import {
  PageWrapper,
  PageHeader,
  Button,
  Badge,
  Select,
  SearchInput,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableTh,
  TableTd,
  TableSkeleton,
  Pagination,
  ErrorMessage,
  EmptyState,
} from '@/components/ui';
import { Forbidden } from '@/components/Forbidden';
import { useAuth } from '@/context/AuthContext';
import { useStaffList, type StaffFilters } from '@/lib/queries/useStaff';
import { InviteStaffModal } from '@/components/settings/staff/InviteStaffModal';
import { StaffDetailSlideOver } from '@/components/settings/staff/StaffDetailSlideOver';

const PAGE_SIZE = 20;
const ADMIN_ROLES: readonly StaffRole[] = ['SUPER_ADMIN', 'CLINIC_ADMIN'];

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function StaffManagementClient() {
  const t = useTranslations('staff');
  const format = useFormatter();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<StaffFilters['role']>('');
  const [isActive, setIsActive] = useState<StaffFilters['isActive']>('');
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = useDebounced(search.trim());
  useEffect(() => setPage(1), [q, role, isActive]);

  const isAdmin = !!user && ADMIN_ROLES.includes(user.role as StaffRole);
  const { data, isLoading, isFetching, error, refetch } = useStaffList(
    { q, role, isActive, page, limit: PAGE_SIZE },
    { enabled: isAdmin }
  );

  if (user && !isAdmin) return <Forbidden />;

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const assignableRoles: readonly StaffRole[] = isSuperAdmin
    ? STAFF_ROLES
    : CLINIC_ADMIN_ASSIGNABLE_ROLES;

  const members = data?.data ?? [];
  const totalPages = data?.meta.pages ?? 1;
  // Derive from the list so optimistic updates show in the slide-over immediately
  const selected = members.find((m) => m.id === selectedId) ?? null;

  const canManage = (member: StaffMember) =>
    member.id !== user?.userId && (isSuperAdmin || !ADMIN_ROLES.includes(member.role));

  const hasFilters = Boolean(q || role || isActive);

  return (
    <PageWrapper className="space-y-6 py-8">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={<Button onClick={() => setInviteOpen(true)}>{t('actions.invite')}</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClear={() => setSearch('')}
            placeholder={t('filters.searchPlaceholder')}
            aria-label={t('filters.search')}
          />
        </div>
        <div className="sm:w-48">
          <Select
            id="staff-role-filter"
            aria-label={t('filters.role')}
            value={role}
            onChange={(e) => setRole(e.target.value as StaffFilters['role'])}
            placeholder={t('filters.allRoles')}
            options={STAFF_ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
          />
        </div>
        <div className="sm:w-40">
          <Select
            id="staff-status-filter"
            aria-label={t('filters.status')}
            value={isActive}
            onChange={(e) => setIsActive(e.target.value as StaffFilters['isActive'])}
            placeholder={t('filters.allStatuses')}
            options={[
              { value: 'true', label: t('status.active') },
              { value: 'false', label: t('status.inactive') },
            ]}
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={5} rows={6} />
      ) : error ? (
        <ErrorMessage
          message={error instanceof Error ? error.message : t('loadError')}
          onRetry={() => refetch()}
        />
      ) : members.length === 0 ? (
        <EmptyState
          title={hasFilters ? t('empty.filteredTitle') : t('empty.title')}
          description={hasFilters ? t('empty.filteredDescription') : t('empty.description')}
        />
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : undefined}>
          <Table>
            <caption className="sr-only">{t('title')}</caption>
            <TableHead>
              <TableRow>
                <TableTh>{t('columns.name')}</TableTh>
                <TableTh>{t('columns.role')}</TableTh>
                <TableTh>{t('columns.status')}</TableTh>
                <TableTh>{t('columns.joined')}</TableTh>
                <TableTh>
                  <span className="sr-only">{t('columns.actions')}</span>
                </TableTh>
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id} data-testid={`staff-row-${member.email}`}>
                  <TableTd>
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {member.fullName}
                    </div>
                    <div className="text-xs text-neutral-500">{member.email}</div>
                  </TableTd>
                  <TableTd>{t(`roles.${member.role}`)}</TableTd>
                  <TableTd>
                    <Badge variant={member.isActive ? 'success' : 'default'}>
                      {member.isActive ? t('status.active') : t('status.inactive')}
                    </Badge>
                  </TableTd>
                  <TableTd className="whitespace-nowrap">
                    {format.dateTime(new Date(member.createdAt), { dateStyle: 'medium' })}
                  </TableTd>
                  <TableTd className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(member.id)}>
                      {t('actions.manage')}
                      <span className="sr-only"> {member.fullName}</span>
                    </Button>
                  </TableTd>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
              <span>{t('pagination', { total: data?.meta.total ?? 0 })}</span>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      <InviteStaffModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        assignableRoles={assignableRoles}
      />

      <StaffDetailSlideOver
        member={selected}
        onClose={() => setSelectedId(null)}
        assignableRoles={assignableRoles}
        canManage={selected ? canManage(selected) : false}
        isSelf={selected?.id === user?.userId}
      />
    </PageWrapper>
  );
}
