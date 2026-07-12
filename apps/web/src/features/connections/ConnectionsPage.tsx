import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/Spinner';

const initialForm = { name: '', host: '', port: '5432', database: '', user: '', password: '', ssl: true };

export function ConnectionsPage() {
  const queryClient = useQueryClient();
  const connections = useQuery({ queryKey: ['connections'], queryFn: api.connections });
  const [form, setForm] = useState(initialForm);
  const [schemaFor, setSchemaFor] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['connections'] });

  const connect = useMutation({
    mutationFn: () =>
      api.connectDb({
        name: form.name,
        dialect: 'postgres',
        credentials: {
          host: form.host,
          port: Number(form.port),
          database: form.database,
          user: form.user,
          password: form.password,
          ssl: form.ssl,
        },
      }),
    onSuccess: () => {
      setForm(initialForm);
      refresh();
    },
  });

  const ingest = useMutation({
    mutationFn: (connectionId: string) => api.ingestSchema(connectionId),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (connectionId: string) => api.deleteConnection(connectionId),
    onSuccess: refresh,
  });

  const schema = useQuery({
    queryKey: ['schema', schemaFor],
    queryFn: () => api.schema(schemaFor!),
    enabled: schemaFor !== null,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    connect.mutate();
  };

  const field = (label: string, key: keyof typeof initialForm, type = 'text') => (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        required
        value={String(form[key])}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Database connections</h2>
        <p className="mt-1 text-sm text-slate-500">
          Credentials are encrypted (AES-256-GCM) before they are stored. The connection is tested first.
        </p>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2">
        {field('Connection name', 'name')}
        {field('Host', 'host')}
        {field('Port', 'port')}
        {field('Database', 'database')}
        {field('User', 'user')}
        {field('Password', 'password', 'password')}
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.ssl} onChange={(e) => setForm({ ...form, ssl: e.target.checked })} />
          Require SSL
        </label>
        <div className="sm:col-span-2">
          {connect.isError && (
            <p className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{connect.error.message}</p>
          )}
          <button
            type="submit"
            disabled={connect.isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {connect.isPending ? 'Testing connection…' : 'Test & save connection'}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {connections.isLoading && <Spinner label="Loading connections…" />}
        {connections.data?.connections.length === 0 && (
          <p className="text-sm text-slate-500">No connections yet — add your first database above.</p>
        )}
        {connections.data?.connections.map((connection) => (
          <div key={connection.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">{connection.name}</h3>
                <p className="text-xs text-slate-500">
                  {connection.host} / {connection.database} ·{' '}
                  {connection.lastIngestedAt
                    ? `indexed ${new Date(connection.lastIngestedAt).toLocaleString()}`
                    : 'schema not indexed yet'}
                </p>
              </div>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => ingest.mutate(connection.id)}
                  disabled={ingest.isPending}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {ingest.isPending && ingest.variables === connection.id
                    ? 'Indexing…'
                    : connection.lastIngestedAt
                      ? 'Re-index schema'
                      : 'Ingest schema'}
                </button>
                <button
                  onClick={() => setSchemaFor(schemaFor === connection.id ? null : connection.id)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {schemaFor === connection.id ? 'Hide schema' : 'View schema'}
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete connection "${connection.name}"?`)) remove.mutate(connection.id);
                  }}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>

            {ingest.isError && ingest.variables === connection.id && (
              <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{ingest.error.message}</p>
            )}

            {schemaFor === connection.id && (
              <div className="mt-4 space-y-2">
                {schema.isLoading && <Spinner label="Loading schema…" />}
                {schema.data?.tables.length === 0 && (
                  <p className="text-sm text-slate-500">No tables indexed. Run schema ingestion first.</p>
                )}
                {schema.data?.tables.map((table) => (
                  <details key={table.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-slate-800">
                      {table.schema}.{table.table}{' '}
                      <span className="text-xs font-normal text-slate-500">({table.columnCount} columns)</span>
                    </summary>
                    <pre className="mt-2 overflow-x-auto text-xs text-slate-600">{table.document}</pre>
                  </details>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
