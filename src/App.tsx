import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useStore } from './lib/store';
import Dashboard from './pages/Dashboard';
import EditorPage from './pages/EditorPage';
import Guidelines from './pages/Guidelines';
import ProjectPage from './pages/ProjectPage';

export default function App() {
  const ready = useStore((s) => s.ready);
  const load = useStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) return <div className="flex h-full items-center justify-center text-xs text-slate-500">Loading workspace…</div>;

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/p/:projectId" element={<ProjectPage />} />
          <Route path="/guidelines" element={<Guidelines />} />
        </Route>
        <Route path="/p/:projectId/i/:itemId" element={<EditorPage />} />
      </Routes>
    </HashRouter>
  );
}
