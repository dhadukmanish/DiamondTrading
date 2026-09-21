import { useEffect, useRef, useState } from 'react';
import { useVariantSearch, type VariantOption } from '../../api/inventory';

/** Search-as-you-type product / sub-product picker. Shows "Product · Sub-product (SKU)". */
export function VariantPicker({ value, onSelect, stockType = 'all', placeholder = 'Select product…', autoFocus }: {
  value?: { productName: string; variantName: string; sku: string } | null; onSelect: (v: VariantOption) => void; stockType?: string; placeholder?: string; autoFocus?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const results = useVariantSearch(term, stockType);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const label = value ? `${value.productName} · ${value.variantName} (${value.sku})` : '';
  return (
    <div ref={box} className="relative">
      <input className="field" autoFocus={autoFocus} placeholder={placeholder} value={open ? term : label} onFocus={() => { setOpen(true); setTerm(''); }} onChange={(e) => setTerm(e.target.value)} />
      {open && term && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto card shadow-lg">
          {results.isLoading && <div className="px-3 py-2 text-ink-muted">Searching…</div>}
          {results.data?.length === 0 && <div className="px-3 py-2 text-ink-muted">No products match</div>}
          {results.data?.map((r) => (
            <button key={r.variantId} className="block w-full text-left px-3 py-2 hover:bg-brand-soft" onMouseDown={() => { onSelect(r); setOpen(false); }}>
              <div className="font-medium">{r.productName} <span className="text-ink-muted">· {r.variantName}</span></div>
              <div className="text-xs text-ink-muted">{r.sku} · {r.stockType.replace(/_/g, ' ')}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
