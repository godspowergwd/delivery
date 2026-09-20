import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Paginated } from '@delivery/shared';
import { api } from '../../lib/api';
import { useRealtimeSync } from '../../lib/realtime';
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from '../../components/ui';

interface LogRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string | null;
  actorName: string;
  actorEmail: string | null;
  actorRole: string | null;
  ip: string | null;
  createdAt: string;
}

export function AdminLogs() {
  useRealtimeSync();
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: filters } = useQuery({
    queryKey: ['admin-log-filters'],
    queryFn: () => api.get<{ actions: string[]; entities: string[] }>('/logs/filters'),
    staleTime: 60_000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-logs', action, entity, search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (action) params.set('action', action);
      if (entity) params.set('entity', entity);
      if (search.trim()) params.set('q', search.trim());
      return api.get<Paginated<LogRow>>(`/logs?${params.toString()}`);
    },
    refetchInterval: 20_000,
  });

  const logs = data?.items ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Activity logs</h1>
        <p className="mt-1 text-sm text-slate-500">Audit trail of every action in the system.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search description, actor or action…"
          className="max-w-xs"
          aria-label="Search logs"
        />
        <Select
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          className="max-w-44"
          aria-label="Filter by action"
        >
          <option value="">All actions</option>
          {(filters?.actions ?? []).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select
          value={entity}
          onChange={(event) => {
            setEntity(event.target.value);
            setPage(1);
          }}
          className="max-w-44"
          aria-label="Filter by entity"
        >
          <option value="">All entities</option>
          {(filters?.entities ?? []).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : isError ? (
        <EmptyState title="Could not load logs" hint="Make sure the API server is running and try again." />
      ) : logs.length === 0 ? (
        <EmptyState title="No activity yet" hint="Actions performed in the app will appear here." />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log.id} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">{log.action}</Badge>
                    <span className="text-sm text-slate-500">{log.entity}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800">{log.description ?? '—'}</p>
                  <p className="text-sm text-slate-500">
                    {log.actorName}
                    {log.actorEmail ? ` · ${log.actorEmail}` : ''}
                    {log.actorRole ? ` · ${log.actorRole}` : ''}
                    {log.ip ? ` · ${log.ip}` : ''}
                  </p>
                </div>
                <span className="flex-none text-sm text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {data && data.pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            ← Prev
          </Button>
          <span className="text-sm text-slate-500">
            Page {data.page} of {data.pageCount}
          </span>
          <Button size="sm" variant="outline" disabled={!data.hasMore} onClick={() => setPage((current) => current + 1)}>
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
