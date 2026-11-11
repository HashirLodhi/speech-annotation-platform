import type { ReactNode } from 'react';

const Section = ({ title, color, children }: { title: string; color: string; children: ReactNode }) => (
  <section className="card p-6">
    <h2 className="mb-4 text-base font-semibold text-white">
      <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: color }} />
      {title}
    </h2>
    <div className="space-y-3 text-[13px] leading-relaxed text-slate-300">{children}</div>
  </section>
);
const H = ({ children }: { children: ReactNode }) => <h3 className="pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</h3>;
const L = ({ items }: { items: ReactNode[] }) => (
  <ul className="list-disc space-y-1 pl-5 marker:text-slate-600">
    {items.map((i, k) => <li key={k}>{i}</li>)}
  </ul>
);
const C = ({ children }: { children: ReactNode }) => <code className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] text-accent">{children}</code>;

export default function Guidelines() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold text-white">Annotation guidelines &amp; methodology</h1>
        <p className="mt-2 text-sm text-slate-400">The rules the validator enforces, the metrics the platform reports and the quality process behind every export.</p>
      </header>

      <Section title="1 · Meeting transcription & speaker diarization" color="#60a5fa">
        <H>Segmentation</H>
        <L items={[
          'One segment = one continuous speaker turn. Start a new segment on every speaker change or a pause longer than ~1.5 s.',
          'Keep segments ≤ 30 s. Place boundaries in silence, never mid-word; leave ~100–200 ms of padding.',
          <>When two people talk over each other, keep two overlapping segments and tag both <C>[overlap]</C>.</>,
        ]} />
        <H>Speaker labelling</H>
        <L items={[
          'Create each speaker once per recording and re-use the label — never create "Speaker 3" for someone already labelled.',
          'Use real names only when stated in the recording; otherwise a role (Host, Guest).',
          'Any speaker with a single turn in a long meeting is flagged as a possible diarization split error.',
        ]} />
        <H>Transcription</H>
        <L items={[
          'Verbatim but readable: keep meaningful repetitions and false starts; drop pure filler ("um", "uh") unless tagged [disfluency] in a verbatim project.',
          <>Non-speech events: <C>[laughter]</C> <C>[noise]</C> <C>[music]</C> <C>[crosstalk]</C> <C>[unintelligible]</C>.</>,
          'Numbers: write as spoken in natural prose; spell out one–ten, use digits for larger values.',
        ]} />
        <H>Outputs</H>
        <L items={['JSON, SRT, WebVTT, timestamped TXT and NIST RTTM — the standard hypothesis/reference format for Diarization Error Rate scoring (e.g. with dscore or pyannote.metrics).']} />
      </Section>

      <Section title="2 · Customer support calls & PII redaction" color="#f472b6">
        <H>Turns</H>
        <L items={['Two speakers per call: Agent and Customer. Hold music / IVR → tag [hold] or [noise].']} />
        <H>What counts as PII</H>
        <L items={[
          <><b>Name</b> of a customer or third party (not the company or agent role name). </>,
          <><b>Phone, Email, Address, Date of birth</b>, <b>Card number</b>, <b>SSN / national ID</b>, <b>Account</b> and <b>Order / ticket</b> identifiers.</>,
          'Spoken forms count: "five five five zero one four two", "jo dot park at gmail dot com".',
          'Redact the value, not the cue: "my number is [PHONE]".',
        ]} />
        <H>Workflow</H>
        <L items={[
          'Transcribe first, then run Auto-detect (regex + cue-phrase heuristics) as pre-annotation.',
          'A human accepts, deletes or adds every span. The Issues tab re-runs detection and flags any PII still uncovered — it must be at zero before approval.',
          'Exports default to privacy-safe: redacted text, PII types + character offsets only, and audio with PII regions replaced by a beep or silence. Raw values are opt-in.',
        ]} />
        <H>Audio redaction accuracy</H>
        <L items={['PII time ranges are estimated from character position inside the segment (+120 ms padding). For high-risk data, split the segment tightly around the PII before exporting.']} />
      </Section>

      <Section title="3 · Speech transcription QA — Mozilla Common Voice" color="#fbbf24">
        <H>Task</H>
        <L items={['Listen to each clip, transcribe what is actually said, compare to the reference sentence, then choose a verdict.']} />
        <H>Verdicts</H>
        <L items={[
          <><b>Accept</b> — speech matches the sentence (case/punctuation differences ignored).</>,
          <><b>Fix</b> — usable audio but the recording deviates (skipped/added words, mispronunciation) or the reference needs correction.</>,
          <><b>Reject</b> — truncated, wrong language, unintelligible, synthetic, heavy noise or clipping. A reason is mandatory.</>,
        ]} />
        <H>Metrics</H>
        <L items={[
          <><b>WER</b> = (S + D + I) / N over normalised words, computed from a Levenshtein alignment; substitutions, deletions and insertions are highlighted inline.</>,
          <><b>CER</b> = character-level edit distance / reference characters.</>,
          'Normalisation: Unicode NFC, optional lower-casing and punctuation removal (both toggles are visible, not hidden).',
        ]} />
        <H>Automatic audio checks</H>
        <L items={['Peak / RMS level, clipped-sample ratio, leading/trailing silence and overall silence ratio pre-suggest audio-issue tags; the reviewer confirms.']} />
        <H>Conventions</H>
        <L items={['Numbers are spelled out as words, consistent with Common Voice text normalisation. Digits trigger a warning.']} />
      </Section>

      <Section title="Quality process" color="#2dd4bf">
        <L items={[
          <><b>Rule-based validation</b> on every save: overlaps, gaps, bounds, empty text, missing speakers, reading-speed outliers, bracket balance, unredacted PII, verdict/WER consistency.</>,
          <><b>Review workflow</b>: To do → In progress → In review → Approved / Rejected, with threaded reviewer comments that can be resolved.</>,
          <><b>Throughput tracking</b>: focused editing time per recording and annotation-time ÷ audio-time ratio per project.</>,
          <><b>Reproducible exports</b>: versioned JSON schema (<C>schema_version</C>) and a manifest with counts and privacy settings.</>,
        ]} />
      </Section>
    </div>
  );
}
