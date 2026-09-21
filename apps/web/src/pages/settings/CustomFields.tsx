import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFieldTypes } from '@erp/shared';
import { http } from '../../api/client';
import { MasterPage } from '../../components/MasterPage';
import { Badge, Button, Input, Modal } from '../../components/ui';

interface CF { id: string; module: string; key: string; label: string; type: string; required: boolean; showInList: boolean; sortOrder: number; isActive: boolean }
interface Opt { id?: string; value: string; displayValue: string; sortOrder: number }

const MODULES = ['contacts', 'products', 'certified_products', 'jewellery_products', 'designs', 'invoice', 'purchase_bill'];

export function CustomFieldsPage() {
  const [optionsFor, setOptionsFor] = useState<CF | null>(null);
  return (
    <>
      <MasterPage<CF> title="Custom Fields" resource="custom-fields"
        columns={[
          { key: 'module', header: 'Module', sortable: true, render: (r) => <Badge>{r.module}</Badge> },
          { key: 'label', header: 'Label', sortable: true }, { key: 'key', header: 'Key', render: (r) => <code>{r.key}</code> },
          { key: 'type', header: 'Type' }, { key: 'required', header: 'Required', render: (r) => r.required ? 'Yes' : '' },
          { key: 'opts', header: '', render: (r) => ['dropdown', 'multiselect'].includes(r.type) ? <Button variant="ghost" className="h-8 px-2" onClick={() => setOptionsFor(r)}>Configure options</Button> : null },
        ]}
        fields={[
          { name: 'module', label: 'Module', type: 'select', required: true, options: MODULES.map((m) => ({ value: m, label: m })) },
          { name: 'label', label: 'Label', required: true }, { name: 'key', label: 'Key', required: true, hint: 'lowercase, underscores', placeholder: 'certificate_no' },
          { name: 'type', label: 'Type', type: 'select', required: true, options: customFieldTypes.map((t) => ({ value: t, label: t })) },
          { name: 'sortOrder', label: 'Order', type: 'number', defaultValue: 0 },
          { name: 'required', label: 'Required', type: 'boolean' }, { name: 'showInList', label: 'Show in list', type: 'boolean' },
          { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true },
        ]} />
      {optionsFor && <OptionsModal field={optionsFor} onClose={() => setOptionsFor(null)} />}
    </>
  );
}

/** "Configure Options": value (stored) + display value (shown), reorderable, saved as a whole list. */
function OptionsModal({ field, onClose }: { field: CF; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cf-options', field.id], queryFn: () => http.get<Opt[]>(`/custom-fields/${field.id}/options`) });
  const [rows, setRows] = useState<Opt[] | null>(null);
  const list = rows ?? q.data ?? [];
  const set = (i: number, patch: Partial<Opt>) => setRows(list.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const save = async () => {
    await http.put(`/custom-fields/${field.id}/options`, { options: list.filter((o) => o.value).map((o, i) => ({ value: o.value, displayValue: o.displayValue || o.value, sortOrder: i })) });
    await qc.invalidateQueries({ queryKey: ['cf-options', field.id] }); onClose();
  };
  return (
    <Modal open title={`Options for ${field.label}`} subtitle="Value is stored, display value is shown" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="grid gap-2">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-ink-muted"><span>Value</span><span>Display value</span><span /></div>
        {list.map((o, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input value={o.value} onChange={(e) => set(i, { value: e.target.value })} />
            <Input value={o.displayValue} onChange={(e) => set(i, { displayValue: e.target.value })} />
            <Button variant="danger" className="px-2" onClick={() => setRows(list.filter((_, j) => j !== i))}>×</Button>
          </div>
        ))}
        <Button variant="ghost" className="justify-self-start" onClick={() => setRows([...list, { value: '', displayValue: '', sortOrder: list.length }])}>+ Add option</Button>
      </div>
    </Modal>
  );
}
