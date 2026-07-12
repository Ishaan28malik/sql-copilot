import type { BenchmarkSummary } from '@sqlcopilot/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { SqlBlock } from '../../components/SqlBlock';
import { api } from '../../lib/api';

interface CaseInput {
  question: string;
  expectedSql: string;
}

const Badge = ({ pass, label }: { pass: boolean; label: string }) => (
  <span
    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
      pass ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
    }`}
  >
    {label}: {pass ? 'pass' : 'fail'}
  </span>
);

const StatCard = ({ label, value, total }: { label: string; value: number; total: number }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-2xl font-bold text-slate-900">
      {value}/{total}
      <span className="ml-2 text-sm font-normal text-slate-400">
        {total > 0 ? Math.round((value / total) * 100) : 0}%
      </span>
    </p>
  </div>
);

export function BenchmarkPage() {
  const connections = useQuery({ queryKey: ['connections'], queryFn: api.connections });
  const [connectionId, setConnectionId] = useState('');
  const [cases, setCases] = useState<CaseInput[]>([{ question: '', expectedSql: '' }]);
  const [summary, setSummary] = useState<BenchmarkSummary | null>(null);

  const selected = connectionId || connections.data?.connections[0]?.id || '';

  const run = useMutation({
    mutationFn: () =>
      api.benchmark({
        connectionId: selected,
        cases: cases.filter((c) => c.question.trim() && c.expectedSql.trim()),
      }),
    onSuccess: setSummary,
  });

  const updateCase = (index: number, patch: Partial<CaseInput>) =>
    setCases(cases.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Benchmark</h2>
          <p className="mt-1 text-sm text-slate-500">
            Compare generated SQL against expected SQL: exact match, execution accuracy, result accuracy.
          </p>
        </div>
        <select
          value={selected}
          onChange={(e) => setConnectionId(e.target.value)}
          className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {connections.data?.connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {cases.map((benchCase, index) => (
          <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center">
              <span className="text-sm font-semibold text-slate-700">Case {index + 1}</span>
              {cases.length > 1 && (
                <button
                  onClick={() => setCases(cases.filter((_, i) => i !== index))}
                  className="ml-auto text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              )}
            </div>
            <input
              value={benchCase.question}
              onChange={(e) => updateCase(index, { question: e.target.value })}
              placeholder="Question, e.g. How many orders were placed last month?"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <textarea
              value={benchCase.expectedSql}
              onChange={(e) => updateCase(index, { expectedSql: e.target.value })}
              placeholder="Expected SQL (SELECT ...)"
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
        ))}
        <div className="flex gap-2">
          <button
            onClick={() => setCases([...cases, { question: '', expectedSql: '' }])}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            + Add case
          </button>
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending || !selected}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {run.isPending ? 'Running benchmark…' : 'Run benchmark'}
          </button>
        </div>
        {run.isError && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{run.error.message}</p>}
      </div>

      {summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Exact match" value={summary.exactMatches} total={summary.total} />
            <StatCard label="Execution accuracy" value={summary.executionAccurate} total={summary.total} />
            <StatCard label="Result accuracy" value={summary.resultAccurate} total={summary.total} />
          </div>

          {summary.cases.map((result, index) => (
            <div key={index} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">{result.question}</p>
              <div className="flex flex-wrap gap-2">
                <Badge pass={result.exactMatch} label="Exact" />
                <Badge pass={result.executionAccuracy} label="Execution" />
                <Badge pass={result.resultAccuracy} label="Result" />
              </div>
              {result.generatedSql && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Generated</p>
                  <SqlBlock sql={result.generatedSql} />
                </div>
              )}
              {result.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{result.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
