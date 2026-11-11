import { create } from 'zustand';
import type { AudioItem, Project, ProjectType } from '../types';
import { idb } from './db';
import { uid } from './util';

export const PROJECT_META: Record<ProjectType, { label: string; short: string; blurb: string }> = {
  meeting: {
    label: 'Meeting Transcription & Speaker Diarization',
    short: 'Meeting + Diarization',
    blurb: 'Segment multi-speaker meetings, label who spoke when, transcribe verbatim and export RTTM for DER scoring.',
  },
  support: {
    label: 'Customer Support Call Annotation & PII Redaction',
    short: 'Support + PII Redaction',
    blurb: 'Transcribe agent/customer calls, tag personal data, and export redacted transcripts and audio.',
  },
  cv_qa: {
    label: 'Speech Transcription QA — Mozilla Common Voice',
    short: 'Common Voice QA',
    blurb: 'Verify clips against reference sentences, compute WER/CER, classify errors and audio defects.',
  },
};

interface State {
  ready: boolean;
  projects: Project[];
  items: AudioItem[];
  load: () => Promise<void>;
  createProject: (p: Omit<Project, 'id' | 'createdAt'>) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  addItem: (item: AudioItem, blob: Blob) => Promise<void>;
  updateItem: (id: string, patch: Partial<AudioItem>) => void;
  deleteItem: (id: string) => Promise<void>;
  getAudio: (id: string) => Promise<Blob | undefined>;
  resetAll: () => Promise<void>;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useStore = create<State>((set, get) => ({
  ready: false,
  projects: [],
  items: [],

  load: async () => {
    let projects = await idb.getAll<Project>('projects');
    const items = await idb.getAll<AudioItem>('items');
    if (projects.length === 0) {
      projects = await seedProjects();
    }
    projects.sort((a, b) => a.createdAt - b.createdAt);
    set({ projects, items, ready: true });
  },

  createProject: async (p) => {
    const project: Project = { ...p, id: uid(), createdAt: Date.now() };
    await idb.put('projects', project);
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  deleteProject: async (id) => {
    const doomed = get().items.filter((i) => i.projectId === id);
    for (const i of doomed) {
      await idb.del('items', i.id);
      await idb.del('audio', i.id);
    }
    await idb.del('projects', id);
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id), items: s.items.filter((i) => i.projectId !== id) }));
  },

  addItem: async (item, blob) => {
    await idb.put('audio', blob, item.id);
    await idb.put('items', item);
    set((s) => ({ items: [...s.items, item] }));
  },

  updateItem: (id, patch) => {
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i)) }));
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        const cur = get().items.find((i) => i.id === id);
        if (cur) void idb.put('items', cur);
        timers.delete(id);
      }, 400),
    );
  },

  deleteItem: async (id) => {
    clearTimeout(timers.get(id));
    await idb.del('items', id);
    await idb.del('audio', id);
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },

  getAudio: (id) => idb.get<Blob>('audio', id),

  resetAll: async () => {
    timers.forEach(clearTimeout);
    timers.clear();
    await Promise.all([idb.clear('items'), idb.clear('audio'), idb.clear('projects')]);
    const projects = await seedProjects();
    set({ projects, items: [] });
  },
}));

async function seedProjects(): Promise<Project[]> {
  const now = Date.now();
  const defs: Omit<Project, 'id'>[] = (['meeting', 'support', 'cv_qa'] as ProjectType[]).map((type, i) => ({
    name: PROJECT_META[type].label,
    type,
    description: PROJECT_META[type].blurb,
    createdAt: now + i,
  }));
  const projects = defs.map((d) => ({ ...d, id: uid() }));
  for (const p of projects) await idb.put('projects', p);
  return projects;
}

export const newItem = (projectId: string, name: string, duration: number, mime: string, extra: Partial<AudioItem> = {}): AudioItem => ({
  id: uid(),
  projectId,
  name,
  duration,
  mime,
  status: 'todo',
  segments: [],
  speakers: [],
  comments: [],
  annotator: 'Me',
  timeSpentSec: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...extra,
});
