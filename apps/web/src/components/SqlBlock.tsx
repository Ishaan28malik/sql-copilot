import { useState } from 'react';

export function SqlBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative rounded-lg bg-slate-900 p-4">
      <button
        onClick={copy}
        className="absolute right-2 top-2 rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-600"
      >
        {copied ? 'Copied ✓' : 'Copy SQL'}
      </button>
      <pre className="overflow-x-auto pr-20 text-sm leading-relaxed text-emerald-300">
        <code>{sql}</code>
      </pre>
    </div>
  );
}
