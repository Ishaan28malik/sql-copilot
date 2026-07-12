import type { AskResponse } from '@sqlcopilot/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ResultsTable } from '../../components/ResultsTable';
import { SqlBlock } from '../../components/SqlBlock';
import { api, ApiError } from '../../lib/api';

interface ChatEntry {
  question: string;
  response?: AskResponse;
  error?: { message: string; attempts?: { sql: string; error: string | null }[] };
}

export function ChatPage() {
  const connections = useQuery({ queryKey: ['connections'], queryFn: api.connections });
  const [connectionId, setConnectionId] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [question, setQuestion] = useState('');
  const [entries, setEntries] = useState<ChatEntry[]>([]);

  const selected = connectionId || connections.data?.connections[0]?.id || '';

  const ask = useMutation({
    mutationFn: (q: string) => api.ask({ connectionId: selected, question: q, conversationId }),
    onSuccess: (response, q) => {
      setConversationId(response.conversationId);
      setEntries((prev) => [...prev, { question: q, response }]);
    },
    onError: (error, q) => {
      const entry: ChatEntry =
        error instanceof ApiError
          ? { question: q, error: { message: error.message, attempts: error.attempts } }
          : { question: q, error: { message: error.message } };
      setEntries((prev) => [...prev, entry]);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim() || !selected) return;
    ask.mutate(question.trim());
    setQuestion('');
  };

  const startNewConversation = () => {
    setConversationId(undefined);
    setEntries([]);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Ask your data</h2>
          <p className="mt-1 text-sm text-slate-500">Natural language in, safe read-only SQL out.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => {
              setConnectionId(e.target.value);
              startNewConversation();
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {connections.data?.connections.length === 0 && <option value="">No connections</option>}
            {connections.data?.connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {entries.length > 0 && (
            <button
              onClick={startNewConversation}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              New chat
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {entries.map((entry, index) => (
          <div key={index} className="space-y-3">
            <div className="ml-auto w-fit max-w-xl rounded-2xl bg-slate-900 px-4 py-2 text-sm text-white">
              {entry.question}
            </div>

            {entry.response && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <SqlBlock sql={entry.response.sql} />
                {entry.response.attempts.length > 1 && (
                  <p className="text-xs text-slate-500">
                    Self-healed after {entry.response.attempts.length - 1} failed attempt
                    {entry.response.attempts.length > 2 ? 's' : ''}.
                  </p>
                )}
                <ResultsTable result={entry.response.result} filename={`query-${index + 1}.csv`} />
              </div>
            )}

            {entry.error && (
              <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-700">{entry.error.message}</p>
                {entry.error.attempts?.map((attempt, i) => (
                  <details key={i} className="text-xs text-red-600">
                    <summary className="cursor-pointer">Attempt {i + 1}</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-slate-700">{attempt.sql}</pre>
                    {attempt.error && <p className="mt-1">{attempt.error}</p>}
                  </details>
                ))}
              </div>
            )}
          </div>
        ))}

        {ask.isPending && (
          <div className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 align-middle" />
            Generating SQL and running your query…
          </div>
        )}
      </div>

      <form onSubmit={submit} className="sticky bottom-6 flex gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='e.g. "Which customers spent more than ₹50,000 this year?"'
          className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
        />
        <button
          type="submit"
          disabled={ask.isPending || !selected}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
