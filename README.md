# Annotate — Speech Data Annotation Platform

A fully working annotation studio for three speech-data projects. React + TypeScript + Tailwind + Vite, no backend:
everything (audio included) is stored in the browser's IndexedDB, so it also deploys as a static site.

| Project | What you can do |
|---|---|
| **Meeting transcription + diarization** | Draw/resize/move speaker segments on the waveform, label speakers, transcribe, tag overlap/laughter/noise, export JSON · SRT · VTT · TXT · **RTTM** |
| **Support calls + PII redaction** | Agent/customer turns, select text to tag PII (name, phone, email, address, card, SSN, account, DOB, order id), heuristic auto-detect, redacted transcripts, **redacted audio (beep/silence)**, privacy-safe exports |
| **Common Voice QA** | Reference vs. transcript with word-level diff, **WER/CER**, accept/fix/reject verdicts, error taxonomy, automatic audio-quality analysis, QA report CSV |

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (WER, PII, parsing, validation, exports)
npm run build    # typecheck + production build in dist/
```

Open **Overview → Load demo data** to generate sample projects. Demo audio is *synthetic* (formant-shaped tones, not real
speech) so the waveform, timestamps and playback behave realistically without shipping recordings. Use **Import audio** in
any project for real files.

## Importing real data
- Audio: WAV, MP3, FLAC, M4A, OGG, Opus, WebM (drag & drop or file picker, multiple files).
- Meeting / support: add `.srt` / `.vtt` files with the same base name to pre-load a draft transcript
  (`Speaker: text` prefixes become speakers).
- Common Voice: also drop the dataset's `validated.tsv` (or any CSV/TSV with `path` + `sentence` columns); sentences, votes,
  gender, age and accent are matched to clips by filename.

## Editor shortcuts
`Space` play/pause · `Ctrl+Enter` play segment · `Alt+←/→` seek · `Alt+↑/↓` prev/next segment · `Alt+1…9` assign speaker ·
`N` new segment · `S` split at playhead · `[` `]` set start/end · `L` loop · `Del` delete · `Ctrl+Z/Y` undo/redo · `?` help.
Drag on the waveform to create a segment; drag edges to resize; `Ctrl`+wheel to zoom.

## Quality assurance
- Live validation: overlaps, gaps, bounds, empty text, missing speakers, long/short segments, speech-rate outliers,
  bracket balance, unredacted PII, verdict/WER consistency — each issue jumps to its segment.
- Review workflow (To do → In progress → In review → Approved/Rejected) with resolvable comments.
- Throughput metrics: focused editing time and annotation-time ÷ audio-time per project.

## Exports
Per recording (JSON, SRT, VTT, TXT, CSV, RTTM, redacted WAV) or per project as a **ZIP** with a manifest and README.
Support-call exports are privacy-safe by default; raw PII text is opt-in. See the in-app **Guidelines** page for the
annotation rules and metric definitions.

## Layout
```
src/lib      audio/Player, text (WER/CER), pii, validate, export, importer, parse, stats, demo, db/store
src/editor   useEditor (segments, speakers, PII, undo/redo), usePlayer
src/components  Waveform, SegmentRow, panels (Speakers, PII, Issues, Comments, CV QA), dialogs
src/pages    Dashboard, ProjectPage, EditorPage, Guidelines
```

## Known limits
- Redacted-audio time ranges for PII are estimated from character position inside a segment (+120 ms padding); split
  segments tightly around PII for high-risk data.
- PII auto-detect is regex/cue-phrase based pre-annotation, English only — always human-reviewed.
- Data lives in one browser profile; there is no sync or multi-user backend.
