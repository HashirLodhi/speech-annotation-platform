import { AudioWaveform, BookOpen, LayoutDashboard, Mic2, PhoneCall, ShieldCheck } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../lib/store';
import { PROJECT_ACCENT } from '../lib/constants';
import type { ProjectType } from '../types';

const ICONS: Record<ProjectType, React.ReactNode> = {
  meeting: <Mic2 size={15} />,
  support: <PhoneCall size={15} />,
  cv_qa: <ShieldCheck size={15} />,
};

const link = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition ${isActive ? 'bg-ink-700 text-white' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'}`;

export default function Layout() {
  const projects = useStore((s) => s.projects);
  const items = useStore((s) => s.items);
  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-600 bg-ink-900 p-3">
        <div className="mb-5 flex items-center gap-2 px-2 pt-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-ink-950">
            <AudioWaveform size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-white">Annotate</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Speech data studio</div>
          </div>
        </div>
        <nav className="space-y-0.5">
          <NavLink to="/" end className={link}>
            <LayoutDashboard size={15} /> Overview
          </NavLink>
          <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Projects</div>
          {projects.map((p) => (
            <NavLink key={p.id} to={`/p/${p.id}`} className={link}>
              <span style={{ color: PROJECT_ACCENT[p.type] }}>{ICONS[p.type]}</span>
              <span className="min-w-0 flex-1 truncate">{p.type === 'meeting' ? 'Meetings' : p.type === 'support' ? 'Support calls' : 'Common Voice QA'}</span>
              <span className="text-[10px] text-slate-600">{items.filter((i) => i.projectId === p.id).length}</span>
            </NavLink>
          ))}
          <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Reference</div>
          <NavLink to="/guidelines" className={link}>
            <BookOpen size={15} /> Guidelines
          </NavLink>
        </nav>
        <p className="mt-auto px-2 text-[10px] leading-relaxed text-slate-600">All data stays in your browser (IndexedDB). Nothing is uploaded.</p>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
