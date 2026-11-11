import { Check, Send } from 'lucide-react';
import { useState } from 'react';
import type { AudioItem } from '../types';
import { useStore } from '../lib/store';
import { uid } from '../lib/util';

export function CommentsPanel({ item }: { item: AudioItem }) {
  const [text, setText] = useState('');
  const [author, setAuthor] = useState<'Annotator' | 'Reviewer'>('Reviewer');
  const update = useStore((s) => s.updateItem);

  const add = () => {
    if (!text.trim()) return;
    update(item.id, { comments: [...item.comments, { id: uid(), author, text: text.trim(), at: Date.now() }] });
    setText('');
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {item.comments.length === 0 && <p className="text-xs text-slate-500">No review comments yet.</p>}
        {item.comments.map((c) => (
          <div key={c.id} className={`rounded-lg border p-2.5 text-xs ${c.resolved ? 'border-ink-600 opacity-50' : 'border-ink-500 bg-ink-800'}`}>
            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
              <span className={c.author === 'Reviewer' ? 'text-amber-300' : 'text-accent'}>{c.author}</span>
              <span>{new Date(c.at).toLocaleString()}</span>
            </div>
            <p className="whitespace-pre-wrap text-slate-200">{c.text}</p>
            <button
              className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-emerald-400"
              onClick={() => update(item.id, { comments: item.comments.map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)) })}
            >
              <Check size={11} /> {c.resolved ? 'Reopen' : 'Resolve'}
            </button>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <select className="input" value={author} onChange={(e) => setAuthor(e.target.value as typeof author)}>
          <option>Reviewer</option>
          <option>Annotator</option>
        </select>
        <textarea className="input min-h-[70px]" placeholder="Leave feedback for this recording…" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary w-full" onClick={add}>
          <Send size={13} /> Add comment
        </button>
      </div>
    </div>
  );
}
