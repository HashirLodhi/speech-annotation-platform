import type { AudioItem, PIISpan, Project, Segment, Speaker } from '../types';
import { encodeWav } from './audio';
import { detectPII } from './pii';
import { newItem, useStore } from './store';
import { SPEAKER_COLORS, uid } from './util';

/**
 * Demo audio is *synthetic*: a formant-ish voiced signal shaped to the syllable rhythm of each line,
 * so the waveform, timestamps and playback behave like real speech without shipping any recordings.
 */
const SR = 16000;
const VOWELS: [number, number][] = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [570, 840], [660, 1720]];

interface Utt {
  speaker: number;
  text: string;
  /** negative = talks over the previous utterance */
  gap?: number;
  tags?: string[];
}
interface Placed extends Utt {
  start: number;
  end: number;
}

const syllables = (t: string) => t.split(/\s+/).reduce((n, w) => n + Math.max(1, Math.round(w.replace(/\W/g, '').length / 3)), 0);

function place(utts: Utt[], lead = 0.6): { placed: Placed[]; total: number } {
  let t = lead;
  let prevEnd = lead;
  const placed: Placed[] = [];
  for (const u of utts) {
    const gap = u.gap ?? 0.35 + (placed.length % 3) * 0.2;
    const start = Math.max(0, prevEnd + gap);
    const end = start + syllables(u.text) * 0.2 + 0.25;
    placed.push({ ...u, start: +start.toFixed(2), end: +end.toFixed(2) });
    prevEnd = Math.max(prevEnd, end);
    t = prevEnd;
  }
  return { placed, total: +(t + 0.8).toFixed(2) };
}

function synth(placed: Placed[], pitches: number[], total: number): Float32Array {
  const out = new Float32Array(Math.ceil(total * SR));
  for (let i = 0; i < out.length; i++) out[i] = (Math.random() - 0.5) * 0.004;
  for (const u of placed) {
    const nSyl = syllables(u.text);
    const sylDur = (u.end - u.start) / nSyl;
    let phase = 0;
    for (let s = 0; s < nSyl; s++) {
      const t0 = u.start + s * sylDur;
      const [f1, f2] = VOWELS[(s * 7 + u.text.length) % VOWELS.length];
      const f0 = pitches[u.speaker % pitches.length] * (1 + 0.07 * Math.sin(s * 0.9 + u.text.length));
      const a = Math.floor(t0 * SR);
      const n = Math.floor(sylDur * 0.88 * SR);
      for (let k = 0; k < n && a + k < out.length; k++) {
        const env = Math.sin((Math.PI * k) / n) ** 2;
        phase += (2 * Math.PI * f0) / SR;
        let v = 0;
        for (let h = 1; h <= 10; h++) {
          const f = h * f0;
          const g = Math.exp(-(((f - f1) / 170) ** 2)) + 0.6 * Math.exp(-(((f - f2) / 280) ** 2)) + 0.05;
          v += (g / h) * Math.sin(h * phase);
        }
        out[a + k] += 0.32 * env * v;
      }
    }
  }
  return out;
}

function wavFor(placed: Placed[], pitches: number[], total: number) {
  return encodeWav({ sampleRate: SR, channels: [synth(placed, pitches, total)] });
}

const mkSpeakers = (defs: [string, string][]): Speaker[] =>
  defs.map(([name, role], i) => ({ id: uid(), name, role, color: SPEAKER_COLORS[i] }));

const toSegments = (placed: Placed[], speakers: Speaker[], withPII = false): Segment[] =>
  placed.map((p) => ({
    id: uid(),
    start: p.start,
    end: p.end,
    speakerId: speakers[p.speaker].id,
    text: p.text,
    tags: p.tags ?? [],
    pii: withPII ? detectPII(p.text) : ([] as PIISpan[]),
  }));

export async function loadDemoData(projects: Project[]) {
  const { addItem } = useStore.getState();
  const byType = (t: Project['type']) => projects.find((p) => p.type === t)!;

  // ---------- 1. Meeting + diarization ----------
  {
    const p = byType('meeting');
    const speakers = mkSpeakers([['Priya', 'Product Manager'], ['Marcus', 'Engineering Lead'], ['Elena', 'Design Lead']]);
    const { placed, total } = place([
      { speaker: 0, text: "Alright everyone, let's get started with the Q3 planning sync." },
      { speaker: 0, text: 'First item is the onboarding redesign and whether we can ship it before the October release.' },
      { speaker: 1, text: 'From the engineering side, the new flow is about sixty percent done.' },
      { speaker: 1, text: "The main risk is the identity verification step, because the vendor API keeps timing out." },
      { speaker: 2, text: 'I can simplify that screen, so we only ask for the document photo once.' },
      { speaker: 0, text: 'That would help, do you have mockups ready?', gap: -0.5, tags: ['[overlap]'] },
      { speaker: 2, text: 'Yes, I will share the Figma link right after this call.', gap: 0.3 },
      { speaker: 1, text: 'Great, then I can estimate the work by Thursday.', gap: 4.1 },
      { speaker: 0, text: 'Perfect. Second topic: the analytics dashboard feedback from beta customers.' },
      { speaker: 2, text: 'Customers love the charts but find the filters confusing.' },
      { speaker: 1, text: 'We could add saved views, which is a small change on the backend.' },
      { speaker: 0, text: 'Let us put saved views on the roadmap and review again next sprint.' },
      { speaker: 2, text: 'Sounds good to me.' },
      { speaker: 1, text: 'Same here, thanks everybody.' },
    ]);
    const item = newItem(p.id, 'q3_planning_sync.wav', total, 'audio/wav', {
      status: 'review',
      speakers,
      segments: toSegments(placed, speakers),
      timeSpentSec: 1260,
    });
    // seed realistic QA findings: one unassigned speaker, one stray overlap
    item.segments[4].speakerId = null;
    item.segments[8].tags = [];
    await addItem(item, wavFor(placed, [118, 105, 205], total));

    const sp2 = mkSpeakers([['Host', 'Interviewer'], ['Guest', 'Interviewee']]);
    const r2 = place([
      { speaker: 0, text: 'Welcome back to the show, today we are talking about accessible design.' },
      { speaker: 1, text: 'Thanks for having me, it is a topic I care about deeply.' },
      { speaker: 0, text: 'Where should a small team start?' },
      { speaker: 1, text: 'Start with keyboard navigation and sensible contrast, everything else builds on that.' },
    ]);
    await addItem(newItem(p.id, 'design_podcast_clip.wav', r2.total, 'audio/wav', { speakers: sp2 }), wavFor(r2.placed, [125, 190], r2.total));
  }

  // ---------- 2. Support + PII ----------
  {
    const p = byType('support');
    const speakers = mkSpeakers([['Agent', 'Support agent'], ['Customer', 'Caller']]);
    const { placed, total } = place([
      { speaker: 0, text: 'Thank you for calling Northwind Support, this is Dana, how can I help you today?' },
      { speaker: 1, text: "Hi Dana, my name is Michael Turner and I'd like a refund for an order that arrived damaged." },
      { speaker: 0, text: 'I am sorry to hear that Michael. Can you give me your order number?' },
      { speaker: 1, text: 'Sure, order number NW-48213-US.' },
      { speaker: 0, text: 'Thank you. And what is the best phone number to reach you on?' },
      { speaker: 1, text: 'It is 415-555-0198, or you can email me at michael.turner@example.com.' },
      { speaker: 0, text: 'Great. To verify your identity, can you confirm your date of birth?' },
      { speaker: 1, text: 'March 14, 1987.' },
      { speaker: 0, text: 'Thanks. Should I send the replacement to 742 Evergreen Terrace Street as before?' },
      { speaker: 1, text: 'No, please use 18 Harbor View Road this time.' },
      { speaker: 0, text: 'Done. The refund will go to the card ending in 4111 1111 1111 1111 within five days.' },
      { speaker: 1, text: 'Perfect, thank you so much for the quick help.' },
    ]);
    const item = newItem(p.id, 'call_0001_refund.wav', total, 'audio/wav', {
      status: 'review',
      speakers,
      segments: toSegments(placed, speakers, true),
      timeSpentSec: 1480,
    });
    await addItem(item, wavFor(placed, [112, 175], total));

    const sp2 = mkSpeakers([['Agent', 'Support agent'], ['Customer', 'Caller']]);
    const r2 = place([
      { speaker: 0, text: 'Hello, you are speaking with Priya at Northwind, how can I help?' },
      { speaker: 1, text: 'Hi, I cannot log in. My account number is AC-7781203 and the email is jo.park at gmail dot com.' },
      { speaker: 0, text: 'Let me reset that for you, can you confirm the zip code and the number ending in five five five zero one four two?' },
    ]);
    await addItem(
      newItem(p.id, 'call_0002_login.wav', r2.total, 'audio/wav', {
        speakers: sp2,
        segments: toSegments(r2.placed, sp2, false),
        status: 'in_progress',
      }),
      wavFor(r2.placed, [185, 120], r2.total),
    );
  }

  // ---------- 3. Common Voice QA ----------
  {
    const p = byType('cv_qa');
    const clips: { ref: string; hyp: string; verdict: 'accept' | 'fix' | 'reject' | null; errors?: string[]; audio?: string[]; meta: [string, string, string, number, number]; noise?: boolean }[] = [
      { ref: 'The weather will be sunny all weekend.', hyp: 'the weather will be sunny all weekend', verdict: 'accept', meta: ['female', 'twenties', 'United States English', 3, 0] },
      { ref: 'Please bring your passport to the airport.', hyp: 'Please bring your passport to the airport', verdict: 'accept', meta: ['male', 'thirties', 'England English', 2, 0] },
      { ref: 'She sells seashells by the seashore.', hyp: 'she sells sea shells by the shore', verdict: 'fix', errors: ['Omission', 'Spelling / word split'], meta: ['female', 'teens', 'Indian English', 2, 1] },
      { ref: 'We arrived at nine in the morning.', hyp: 'we arrived at 9 in the morning', verdict: 'fix', errors: ['Numeral format'], meta: ['male', 'fourties', 'Australian English', 2, 0] },
      { ref: 'The library closes early on Fridays.', hyp: 'the library closes early on', verdict: 'reject', errors: ['Truncated end'], audio: ['Clipped / cut off'], meta: ['female', 'fifties', 'Canadian English', 2, 1] },
      { ref: 'He forgot his umbrella again.', hyp: 'he forgot his umbrella again', verdict: null, meta: ['male', 'twenties', 'Scottish English', 1, 0], noise: true },
    ];
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      const spoken = c.verdict === 'reject' ? c.hyp : c.ref;
      const { placed, total } = place([{ speaker: 0, text: spoken, gap: 0.3 + (i % 3) * 0.2 }], 0.2);
      const name = `common_voice_en_${String(39200 + i * 37).padStart(8, '0')}.wav`;
      const item = newItem(p.id, name, total, 'audio/wav', {
        status: c.verdict ? (c.verdict === 'reject' ? 'rejected' : 'approved') : 'todo',
        segments: c.verdict || i === 5 ? [{ id: uid(), start: placed[0].start, end: placed[0].end, speakerId: null, text: c.hyp, tags: [], pii: [] }] : [],
        cv: { reference: c.ref, gender: c.meta[0], age: c.meta[1], accent: c.meta[2], upVotes: c.meta[3], downVotes: c.meta[4], locale: 'en' },
        qa: { verdict: c.verdict, errorTypes: c.errors ?? [], audioIssues: c.audio ?? [], notes: '' },
        timeSpentSec: 40 + i * 9,
      });
      const pcm = synth(placed, [i % 2 ? 120 : 190], total);
      if (c.noise) for (let k = 0; k < pcm.length; k++) pcm[k] += (Math.random() - 0.5) * 0.12;
      await addItem(item, encodeWav({ sampleRate: SR, channels: [pcm] }));
    }
  }
}

export type { AudioItem };
