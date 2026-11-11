export type ProjectType = 'meeting' | 'support' | 'cv_qa';
export type ItemStatus = 'todo' | 'in_progress' | 'review' | 'approved' | 'rejected';

export interface Speaker {
  id: string;
  name: string;
  color: string;
  role?: string;
}

export type PIIType =
  | 'NAME' | 'PHONE' | 'EMAIL' | 'ADDRESS' | 'CARD' | 'SSN' | 'ACCOUNT' | 'DOB' | 'ORDER_ID' | 'OTHER';

export interface PIISpan {
  id: string;
  start: number; // char offset in segment.text
  end: number;
  type: PIIType;
  text: string;
  auto?: boolean;
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  speakerId: string | null;
  text: string;
  tags: string[];
  pii: PIISpan[];
}

export interface ReviewComment {
  id: string;
  author: string;
  text: string;
  at: number;
  resolved?: boolean;
}

export interface CVMeta {
  reference: string;
  upVotes?: number;
  downVotes?: number;
  age?: string;
  gender?: string;
  accent?: string;
  locale?: string;
}

export type Verdict = 'accept' | 'fix' | 'reject';

export interface QAResult {
  verdict: Verdict | null;
  errorTypes: string[];
  audioIssues: string[];
  notes: string;
}

export interface AudioItem {
  id: string;
  projectId: string;
  name: string;
  duration: number;
  mime: string;
  status: ItemStatus;
  segments: Segment[];
  speakers: Speaker[];
  cv?: CVMeta;
  qa?: QAResult;
  comments: ReviewComment[];
  annotator: string;
  timeSpentSec: number;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  description: string;
  createdAt: number;
}
