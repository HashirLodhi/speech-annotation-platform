import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import type { ItemStatus } from '../types';
import { STATUS_META } from '../lib/constants';

export function StatusBadge({ status }: { status: ItemStatus }) {
  const m = STATUS_META[status];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>{m.label}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div
        className={`card max-h-[90vh] w-full overflow-y-auto p-5 shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Bar({ value, max, color = '#2dd4bf', className = '' }: { value: number; max: number; color?: string; className?: string }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-ink-600 ${className}`}>
      <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-500 px-6 py-12 text-center">
      <div className="text-sm font-medium text-slate-300">{title}</div>
      <div className="mt-1 max-w-md text-xs text-slate-500">{children}</div>
    </div>
  );
}
