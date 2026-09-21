import { useEffect, useRef, useState } from 'react';
import { useContactSearch, type ContactOption } from '../../api/lookups';
import { Modal } from '../ui';
import { ContactForm } from '../../pages/contacts/ContactForm';

/** Vendor / customer picker: "81-CORI ZUCKERMAN" list + "+ Create New" opening the full contact form. */
export function PartySelect({ type, value, onChange, disabled }: { type: 'vendor' | 'customer'; value?: ContactOption | null; onChange: (c: ContactOption) => void; disabled?: boolean }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const q = useContactSearch(type, term);
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return (
    <div ref={box} className="relative">
      <input className="field" disabled={disabled} placeholder={`Select ${type}`} value={open ? term : value?.label ?? ''} onFocus={() => { setOpen(true); setTerm(''); }} onChange={(e) => setTerm(e.target.value)} />
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto card shadow-lg">
          {q.data?.map((c) => <button key={c.id} className="block w-full text-left px-3 py-2 hover:bg-brand-soft" onMouseDown={() => { onChange(c); setOpen(false); }}>{c.label}</button>)}
          {q.data?.length === 0 && <div className="px-3 py-2 text-ink-muted">No {type}s found</div>}
          <button className="block w-full text-left px-3 py-2 border-t border-line text-brand font-medium" onMouseDown={() => { setCreating(true); setOpen(false); }}>+ Create New {type === 'vendor' ? 'Vendor' : 'Customer'}</button>
        </div>
      )}
      {creating && (
        <Modal open title={`Create ${type === 'vendor' ? 'Vendor' : 'Customer'}`} subtitle="Add a new contact to your CRM" onClose={() => setCreating(false)} wide>
          <ContactForm presetType={type} onDone={(c) => { setCreating(false); if (c.id) onChange({ id: c.id, label: c.displayName, serialNo: 0, displayName: c.displayName, discountType: 'flat', discountValue: '0' }); }} />
        </Modal>
      )}
    </div>
  );
}
