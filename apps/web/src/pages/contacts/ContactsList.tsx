import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useList, useRemove } from '../../api/hooks';
import { DataTable } from '../../components/DataTable';
import { Badge } from '../../components/ui';

interface Row { id: string; serialNo: number; displayName: string; primaryContactPerson: string | null; type: string; email: string | null; mobile: string | null; createdAt: string; isActive: boolean }
const TYPE_LABEL: Record<string, string> = { customer: 'Customer', vendor: 'Vendor', both: 'Customer & Vendor', broker: 'Broker' };

export function ContactsListPage() {
  const nav = useNavigate();
  const [params, setParams] = useState<{ page: number; pageSize: number; search: string; sort?: string }>({ page: 1, pageSize: 20, search: '' });
  const [reveal, setReveal] = useState<Set<string>>(new Set());
  const list = useList<Row>('contacts', params);
  const remove = useRemove('contacts');
  const mask = (m: string) => m.replace(/.(?=.{4})/g, '•');

  return (
    <DataTable<Row> title="Contacts" columns={[
      { key: 'displayName', header: 'Contact', sortable: true, render: (r) => <div><button className="font-medium text-brand" onClick={() => nav(`/contacts/${r.id}`)}>{r.primaryContactPerson || r.displayName}</button><div className="text-xs text-ink-muted">#{r.serialNo}</div></div> },
      { key: 'company', header: 'Company Name', render: (r) => r.displayName },
      { key: 'type', header: 'Type', sortable: true, render: (r) => <Badge tone={r.type === 'vendor' ? 'orange' : r.type === 'broker' ? 'gray' : 'blue'}>{TYPE_LABEL[r.type]}</Badge> },
      { key: 'email', header: 'Email', sortable: true },
      { key: 'mobile', header: 'Mobile', render: (r) => r.mobile ? <span className="inline-flex items-center gap-2">{reveal.has(r.id) ? r.mobile : mask(r.mobile)}<button className="text-ink-faint hover:text-ink" title="Reveal" onClick={() => setReveal((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}>👁</button></span> : '' },
      { key: 'createdAt', header: 'Created At', sortable: true, render: (r) => new Date(r.createdAt).toLocaleDateString() },
    ]}
      data={list.data} loading={list.isLoading} params={params} onParams={setParams}
      onAdd={() => nav('/contacts/new')} onEdit={(r) => nav(`/contacts/${r.id}`)}
      onDelete={async (r) => { if (confirm(`Delete ${r.displayName}?`)) await remove.mutateAsync(r.id); }}
      searchPlaceholder="Search by name, email, mobile, GSTIN…" />
  );
}
