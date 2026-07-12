import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Spinner } from '../../components/Spinner';
import { SqlBlock } from '../../components/SqlBlock';
import { api } from '../../lib/api';

export function HistoryPage() {
  const history = useQuery({ queryKey: ['history'], queryFn: api.history });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['conversation', selectedId],
    queryFn: () => api.conversation(selectedId!),
    enabled: selectedId !== null,
  });

  return (
    <div className="mx-auto flex max-w-5xl gap-6">
      <div className="w-80 shrink-0 space-y-2">
        <h2 className="text-2xl font-bold text-slate-900">History</h2>
        {history.isLoading && <Spinner />}
        {history.data?.conversations.length === 0 && (
          <p className="text-sm text-slate-500">No conversations yet.</p>
        )}
        {history.data?.conversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => setSelectedId(conversation.id)}
            className={`block w-full rounded-xl border p-3 text-left text-sm ${
              selectedId === conversation.id
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'
            }`}
          >
            <span className="block truncate font-medium">{conversation.title}</span>
            <span className={`text-xs ${selectedId === conversation.id ? 'text-slate-300' : 'text-slate-400'}`}>
              {conversation.messageCount} message{conversation.messageCount === 1 ? '' : 's'} ·{' '}
              {new Date(conversation.createdAt).toLocaleString()}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4">
        {selectedId === null && (
          <p className="mt-12 text-center text-sm text-slate-400">Select a conversation to view its queries.</p>
        )}
        {detail.isLoading && <Spinner label="Loading conversation…" />}
        {detail.data?.messages.map((message) => (
          <div key={message.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">{message.question}</p>
            {message.sql && <SqlBlock sql={message.sql} />}
            <div className="flex gap-3 text-xs text-slate-500">
              {message.rowCount !== null && <span>{message.rowCount} rows</span>}
              {message.executionMs !== null && <span>{message.executionMs} ms</span>}
              <span>{new Date(message.createdAt).toLocaleString()}</span>
            </div>
            {message.error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{message.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
