import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthUser, Paginated } from '@delivery/shared';
import { api } from '../../lib/api';
import { useRealtimeSync } from '../../lib/realtime';
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from '../../components/ui';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from '../../lib/realtime';

export function AdminUsers() {
  useRealtimeSync();
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<'ALL' | AuthUser['role']>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-users', roleFilter, statusFilter, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('q', search.trim());
      return api.get<Paginated<AuthUser>>(`/users?${params.toString()}`);
    },
    staleTime: 15_000,
  });

  const users = data?.items ?? [];

  const setRole = async (user: AuthUser, role: AuthUser['role']) => {
    try {
      await api.patch(`/users/${user.id}`, { role });
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast(`${user.name} is now ${role.toLowerCase()}`, 'success');
    } catch (error: any) {
      toast(error?.message ?? 'Failed to update role', 'error');
    }
  };

  const [pendingDisable, setPendingDisable] = useState<AuthUser | null>(null);

  const disable = async (user: AuthUser) => {
    setPendingDisable(user);
  };

  const confirmDisable = async () => {
    const user = pendingDisable;
    if (!user) return;
    setPendingDisable(null);
    try {
      await api.post(`/users/${user.id}/disable`);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast('User disabled', 'success');
    } catch (error: any) {
      toast(error?.message ?? 'Failed to disable user', 'error');
    }
  };

  const activate = async (user: AuthUser) => {
    try {
      await api.post(`/users/${user.id}/activate`);
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast('User activated', 'success');
    } catch (error: any) {
      toast(error?.message ?? 'Failed to activate user', 'error');
    }
  };

  return (
    <div className="space-y-4">
            <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">People</h1>
      <p className="mt-1 text-sm text-slate-500">Manage customers, staff, and admins.</p>

      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search name, email or phone…"
          className="max-w-xs"
          aria-label="Search users"
        />
        <Select
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value as 'ALL' | AuthUser['role']);
            setPage(1);
          }}
          className="max-w-40"
          aria-label="Filter by role"
        >
          <option value="ALL">All roles</option>
          <option value="CUSTOMER">Customers</option>
          <option value="KITCHEN">Kitchen</option>
          <option value="ADMIN">Admins</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as 'all' | 'active' | 'disabled');
            setPage(1);
          }}
          className="max-w-40"
          aria-label="Filter by status"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : isError ? (
        <EmptyState title="Could not load users" hint="Make sure the API server is running and try again." />
      ) : users.length === 0 ? (
        <EmptyState title="No users found" hint="Adjust the filters or clear the search." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {users.map((user) => (
            <div key={user.id} className="flex flex-wrap items-start justify-between gap-3 p-4 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-base font-bold text-slate-700">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="truncate font-bold text-slate-900">{user.name}</p>
                    {user.isProtected && <Badge variant="outline">Owner</Badge>}
                  </div>
                  <p className="truncate text-sm text-slate-500">{user.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="text-sm text-slate-500">
                  Joined {new Date(user.createdAt).toLocaleDateString()}
                </span>
                <select
                  value={user.role}
                  onChange={(event) => void setRole(user, event.target.value as AuthUser['role'])}
                  disabled={user.isProtected}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-800 disabled:opacity-50"
                >
                  <option value="CUSTOMER">Customer</option>
                  <option value="KITCHEN">Kitchen</option>
                  <option value="ADMIN">Admin</option>
                </select>
                {user.isActive ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="destructive">Disabled</Badge>
                )}
                {user.isProtected ? (
                  <span className="text-sm text-slate-600">Protected</span>
                ) : user.isActive ? (
                  <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void disable(user)}>
                    Disable
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => void activate(user)}>
                    Activate
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {data && data.pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            ← Prev
          </Button>
          <span className="text-sm text-slate-500">
            Page {data.page} of {data.pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!data.hasMore}
            onClick={() => setPage((current) => current + 1)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
