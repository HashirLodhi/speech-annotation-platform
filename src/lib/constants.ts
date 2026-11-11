import type { ItemStatus, ProjectType } from '../types';

export const STATUS_META: Record<ItemStatus, { label: string; cls: string }> = {
  todo: { label: 'To do', cls: 'bg-slate-700/50 text-slate-300 border-slate-600' },
  in_progress: { label: 'In progress', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  review: { label: 'In review', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  approved: { label: 'Approved', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  rejected: { label: 'Rejected', cls: 'bg-red-500/15 text-red-300 border-red-500/40' },
};
export const STATUS_ORDER: ItemStatus[] = ['todo', 'in_progress', 'review', 'approved', 'rejected'];

/** Annotation tags (non-lexical events) per project type. */
export const TAGS: Record<ProjectType, string[]> = {
  meeting: ['[overlap]', '[crosstalk]', '[laughter]', '[noise]', '[music]', '[unintelligible]', '[disfluency]'],
  support: ['[overlap]', '[hold]', '[noise]', '[silence]', '[unintelligible]', '[disfluency]'],
  cv_qa: [],
};

/** Error taxonomy for the Common Voice QA task. */
export const CV_ERROR_TYPES = [
  'Substitution', 'Omission', 'Insertion', 'Mispronunciation', 'Truncated start', 'Truncated end',
  'Spelling / word split', 'Numeral format', 'Punctuation / casing', 'Wrong language', 'Reader deviates from text',
];
export const CV_AUDIO_ISSUES = [
  'Background noise', 'Clipped / cut off', 'Low volume', 'Distortion / clipping', 'Long silence', 'Multiple speakers',
  'Echo / reverb', 'Microphone pops', 'Synthetic / TTS voice',
];

export const PROJECT_ACCENT: Record<ProjectType, string> = {
  meeting: '#60a5fa',
  support: '#f472b6',
  cv_qa: '#fbbf24',
};
