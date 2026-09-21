import { useState } from 'react';
import { MasterPage } from '../../components/MasterPage';
import { Badge } from '../../components/ui';
import { useAll } from '../../api/hooks';

type Tab = 'currencies' | 'units' | 'tax-rates' | 'categories' | 'payment-terms' | 'sales-persons' | 'locations';
const TABS: { key: Tab; label: string }[] = [
  { key: 'currencies', label: 'Currencies' }, { key: 'units', label: 'Units' }, { key: 'tax-rates', label: 'Tax rates' },
  { key: 'categories', label: 'Categories' }, { key: 'payment-terms', label: 'Payment terms' }, { key: 'sales-persons', label: 'Sales persons' }, { key: 'locations', label: 'Locations' },
];

/** One screen, one tab per simple master — each tab is a config for MasterPage. */
export function MastersPage() {
  const [tab, setTab] = useState<Tab>('currencies');
  return (
    <div>
      <div className="flex gap-1 mb-5 border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 -mb-px border-b-2 ${tab === t.key ? 'border-brand text-brand font-medium' : 'border-transparent text-ink-muted hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'currencies' && <MasterPage title="Currencies" resource="currencies"
        columns={[{ key: 'code', header: 'Code', sortable: true }, { key: 'name', header: 'Name' }, { key: 'symbol', header: 'Symbol' }, { key: 'decimals', header: 'Decimals' }]}
        fields={[{ name: 'code', label: 'Code', required: true, placeholder: 'INR' }, { name: 'name', label: 'Name', required: true }, { name: 'symbol', label: 'Symbol', required: true }, { name: 'decimals', label: 'Decimals', type: 'number', defaultValue: 2 }, { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true }]} />}
      {tab === 'units' && <MasterPage title="Units" resource="units"
        columns={[{ key: 'code', header: 'Code', sortable: true }, { key: 'name', header: 'Name' }, { key: 'decimals', header: 'Decimals' }]}
        fields={[{ name: 'code', label: 'Code', required: true, placeholder: 'PCS' }, { name: 'name', label: 'Name', required: true }, { name: 'decimals', label: 'Decimals', type: 'number', defaultValue: 2 }, { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true }]} />}
      {tab === 'tax-rates' && <MasterPage<{ id: string; name: string; rate: string; type: string }> title="Tax rates" resource="tax-rates"
        columns={[{ key: 'name', header: 'Name', sortable: true }, { key: 'rate', header: 'Rate %', sortable: true }, { key: 'type', header: 'Type', render: (r) => <Badge>{r.type}</Badge> }]}
        fields={[{ name: 'name', label: 'Name', required: true, placeholder: 'GST 3%' }, { name: 'rate', label: 'Rate %', type: 'number', required: true },
          { name: 'type', label: 'Type', type: 'select', defaultValue: 'gst', options: ['gst', 'out_of_scope', 'exempt', 'nil'].map((v) => ({ value: v, label: v })) },
          { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true }]}
        toForm={(r) => ({ ...r, rate: Number(r.rate) })} />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'payment-terms' && <MasterPage<{ id: string; name: string; days: number; isDefault: boolean }> title="Payment terms" resource="payment-terms"
        columns={[{ key: 'name', header: 'Term', sortable: true }, { key: 'days', header: 'Days', sortable: true }, { key: 'isDefault', header: 'Default', render: (r) => r.isDefault ? <Badge tone="blue">Default</Badge> : null }]}
        fields={[{ name: 'name', label: 'Term name', required: true }, { name: 'days', label: 'Number of days', type: 'number', defaultValue: 0 }, { name: 'isDefault', label: 'Mark as default', type: 'boolean' }]} />}
      {tab === 'sales-persons' && <MasterPage title="Sales persons" resource="sales-persons"
        columns={[{ key: 'name', header: 'Name', sortable: true }, { key: 'email', header: 'Email' }, { key: 'phone', header: 'Phone' }]}
        fields={[{ name: 'name', label: 'Name', required: true }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone' }, { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true }]} />}
      {tab === 'locations' && <LocationsTab />}
    </div>
  );
}

function CategoriesTab() {
  const all = useAll<{ id: string; name: string }>('categories');
  return <MasterPage<{ id: string; name: string; parentId: string | null }> title="Categories" resource="categories"
    columns={[{ key: 'name', header: 'Name', sortable: true }, { key: 'parentId', header: 'Parent', render: (r) => all.data?.find((c) => c.id === r.parentId)?.name ?? '' }]}
    fields={[{ name: 'name', label: 'Name', required: true }, { name: 'parentId', label: 'Parent category', type: 'select', options: () => (all.data ?? []).map((c) => ({ value: c.id, label: c.name })) }, { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true }]} />;
}

function LocationsTab() {
  const all = useAll<{ id: string; name: string; kind: string }>('locations');
  return <MasterPage<{ id: string; name: string; kind: string; code: string | null; parentId: string | null }> title="Locations" resource="locations"
    columns={[{ key: 'name', header: 'Name', sortable: true }, { key: 'kind', header: 'Type', render: (r) => <Badge>{r.kind}</Badge> }, { key: 'code', header: 'Code' },
      { key: 'parentId', header: 'Within', render: (r) => all.data?.find((c) => c.id === r.parentId)?.name ?? '' }]}
    fields={[{ name: 'kind', label: 'Type', type: 'select', required: true, options: ['country', 'state', 'city', 'area'].map((v) => ({ value: v, label: v })) },
      { name: 'name', label: 'Name', required: true }, { name: 'code', label: 'Code', hint: 'ISO / GST state code' },
      { name: 'parentId', label: 'Within', type: 'select', options: () => (all.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.kind})` })) }]} />;
}
