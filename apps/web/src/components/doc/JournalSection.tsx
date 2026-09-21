import { useJournal } from '../../api/inventory';

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "Journal" block at the bottom of every posted document. */
export function JournalSection({ sourceType, sourceId }: { sourceType: string; sourceId?: string }) {
  const j = useJournal(sourceType, sourceId);
  if (!sourceId) return null;
  const dr = j.data?.lines.reduce((s, l) => s + l.debit, 0) ?? 0;
  const cr = j.data?.lines.reduce((s, l) => s + l.credit, 0) ?? 0;
  return (
    <section className="card">
      <div className="px-5 py-3 border-b border-line text-[13px] font-semibold tracking-wide text-ink-muted">Journal entries</div>
      {!j.data ? <p className="px-5 py-4 text-ink-muted">{j.isLoading ? 'Loading…' : 'No journal entry for this document.'}</p> : (
        <table className="w-full"><thead className="text-xs text-ink-muted"><tr><th className="text-left px-5 py-2">Account</th><th className="text-right px-5">Debit</th><th className="text-right px-5">Credit</th></tr></thead>
          <tbody>{j.data.lines.map((l) => <tr key={l.id} className="border-t border-line"><td className="px-5 py-2">{l.accountName}{l.narration && <span className="text-ink-muted text-xs"> — {l.narration}</span>}</td><td className="px-5 text-right tabular-nums">{fmt(l.debit)}</td><td className="px-5 text-right tabular-nums">{fmt(l.credit)}</td></tr>)}
            <tr className="border-t-2 border-line font-semibold"><td className="px-5 py-2">Total</td><td className="px-5 text-right tabular-nums">{fmt(dr)}</td><td className="px-5 text-right tabular-nums">{fmt(cr)}</td></tr></tbody></table>
      )}
    </section>
  );
}
