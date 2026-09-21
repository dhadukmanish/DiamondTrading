import { Badge } from '../../components/ui';
import { MasterPage } from '../../components/MasterPage';
import { useAll } from '../../api/hooks';
import { dateFormats } from '@erp/shared';

interface Currency { id: string; code: string; name: string }
interface Firm { id: string; name: string; gstin: string | null; baseCurrencyId: string; dateFormat: string; isDefault: boolean; isActive: boolean }
interface Branch { id: string; name: string; code: string | null; firmId: string; isDefault: boolean; isActive: boolean }

export function FirmsPage() {
  const cur = useAll<Currency>('currencies');
  const opts = () => (cur.data ?? []).map((c) => ({ value: c.id, label: `${c.code} – ${c.name}` }));
  return (
    <MasterPage<Firm> title="Firms" resource="firms" wide
      columns={[
        { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}{r.isDefault && <Badge tone="blue">Default</Badge>}</span> },
        { key: 'gstin', header: 'GSTIN' }, { key: 'dateFormat', header: 'Date format' },
        { key: 'isActive', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
      ]}
      fields={[
        { name: 'name', label: 'Firm name', required: true }, { name: 'legalName', label: 'Legal name' },
        { name: 'gstin', label: 'GSTIN' }, { name: 'pan', label: 'PAN' },
        { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' },
        { name: 'address', label: 'Address', span: 2 },
        { name: 'baseCurrencyId', label: 'Base currency', type: 'select', required: true, options: opts },
        { name: 'stateCode', label: 'State code (GST)', placeholder: '24' },
        { name: 'dateFormat', label: 'Date format', type: 'select', options: dateFormats.map((d) => ({ value: d, label: d })), defaultValue: 'DD-MM-YYYY' },
        { name: 'fyStartMonth', label: 'Financial year starts (month)', type: 'number', defaultValue: 4 },
        { name: 'gstApplicable', label: 'GST applicable', type: 'boolean', defaultValue: true },
        { name: 'isDefault', label: 'Default firm', type: 'boolean' },
        { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true },
      ]}
    />
  );
}

export function BranchesPage() {
  const firms = useAll<Firm>('firms');
  const cur = useAll<Currency>('currencies');
  const firmName = (id: string) => firms.data?.find((f) => f.id === id)?.name ?? '';
  return (
    <MasterPage<Branch> title="Branches" resource="branches"
      columns={[
        { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}{r.isDefault && <Badge tone="blue">Default</Badge>}</span> },
        { key: 'code', header: 'Code' }, { key: 'firmId', header: 'Firm', render: (r) => firmName(r.firmId) },
        { key: 'isActive', header: 'Status', render: (r) => <Badge tone={r.isActive ? 'green' : 'gray'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
      ]}
      fields={[
        { name: 'firmId', label: 'Firm', type: 'select', required: true, options: () => (firms.data ?? []).map((f) => ({ value: f.id, label: f.name })) },
        { name: 'name', label: 'Branch name', required: true }, { name: 'code', label: 'Code' },
        { name: 'stateCode', label: 'State code (GST)' },
        { name: 'defaultCurrencyId', label: 'Default currency', type: 'select', options: () => (cur.data ?? []).map((c) => ({ value: c.id, label: c.code })) },
        { name: 'address', label: 'Address', span: 2 },
        { name: 'isDefault', label: 'Default branch', type: 'boolean' }, { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true },
      ]}
    />
  );
}
