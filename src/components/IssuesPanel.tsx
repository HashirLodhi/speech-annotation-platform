import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { Issue } from '../lib/validate';

const ICON = {
  error: <AlertCircle size={14} className="shrink-0 text-red-400" />,
  warn: <AlertTriangle size={14} className="shrink-0 text-amber-400" />,
  info: <Info size={14} className="shrink-0 text-sky-400" />,
};

export function IssuesPanel({ issues, onJump }: { issues: Issue[]; onJump: (segId: string) => void }) {
  if (issues.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <CheckCircle2 className="text-emerald-400" />
        <div className="text-sm font-medium text-white">All checks passed</div>
        <p className="text-xs text-slate-500">No validation issues. Ready to submit for review.</p>
      </div>
    );
  const e = issues.filter((i) => i.severity === 'error').length;
  const w = issues.filter((i) => i.severity === 'warn').length;
  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <span className="chip text-red-300">{e} {e === 1 ? 'error' : 'errors'}</span>
        <span className="chip text-amber-300">{w} {w === 1 ? 'warning' : 'warnings'}</span>
        <span className="chip text-sky-300">{issues.length - e - w} {issues.length - e - w === 1 ? 'note' : 'notes'}</span>
      </div>
      {issues.map((i) => (
        <button
          key={i.id}
          disabled={!i.segmentId}
          onClick={() => i.segmentId && onJump(i.segmentId)}
          className="flex w-full items-start gap-2 rounded-lg border border-ink-600 bg-ink-800 p-2.5 text-left text-xs text-slate-300 transition enabled:hover:border-ink-500 enabled:hover:bg-ink-700"
        >
          {ICON[i.severity]}
          <span className="leading-snug">{i.message}</span>
        </button>
      ))}
    </div>
  );
}
