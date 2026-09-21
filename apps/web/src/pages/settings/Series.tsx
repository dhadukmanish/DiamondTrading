import { docTypes } from '@erp/shared';
import { MasterPage } from '../../components/MasterPage';
import { Badge } from '../../components/ui';
import { useAll } from '../../api/hooks';

interface Series { id: string; docType: string; prefix: string; separator: string; useFinancialYear: boolean; nextNumber: number; padding: number; seriesType: string; firmId: string | null; branchId: string | null; isDefault: boolean; isActive: boolean }

const label = (d: string) => d.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function SeriesPage() {
  const firms = useAll<{ id: string; name: string }>('firms');
  const branches = useAll<{ id: string; name: string; firmId: string }>('branches');
  const preview = (s: Series) => `${s.prefix}${s.separator}${s.useFinancialYear ? '26/27' + s.separator : ''}${String(s.nextNumber).padStart(s.padding, '0')}`;
  return (
    <MasterPage<Series> title="Document Series" resource="document-series" wide
      columns={[
        { key: 'docType', header: 'Document', sortable: true, render: (r) => label(r.docType) },
        { key: 'prefix', header: 'Prefix', sortable: true }, { key: 'preview', header: 'Next number', render: (r) => <code>{preview(r)}</code> },
        { key: 'firmId', header: 'Firm', render: (r) => firms.data?.find((f) => f.id === r.firmId)?.name ?? 'All firms' },
        { key: 'seriesType', header: 'Type', render: (r) => <Badge tone={r.seriesType === 'regulated' ? 'blue' : 'gray'}>{r.seriesType}</Badge> },
        { key: 'isDefault', header: 'Default', render: (r) => r.isDefault ? <Badge tone="green">Default</Badge> : null },
      ]}
      fields={[
        { name: 'docType', label: 'Document type', type: 'select', required: true, options: docTypes.map((d) => ({ value: d, label: label(d) })) },
        { name: 'prefix', label: 'Prefix', required: true, placeholder: 'POK' },
        { name: 'firmId', label: 'Firm', type: 'select', hint: 'Blank = all firms', options: () => (firms.data ?? []).map((f) => ({ value: f.id, label: f.name })) },
        { name: 'branchId', label: 'Branch', type: 'select', hint: 'Blank = one counter for the firm', options: () => (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })) },
        { name: 'separator', label: 'Separator', defaultValue: '-' }, { name: 'padding', label: 'Zero padding', type: 'number', defaultValue: 0 },
        { name: 'nextNumber', label: 'Next number', type: 'number', defaultValue: 1 },
        { name: 'seriesType', label: 'Series type', type: 'select', defaultValue: 'regulated', hint: 'Regulated: number cannot be changed on the document', options: [{ value: 'regulated', label: 'Regulated' }, { value: 'unregulated', label: 'Unregulated' }] },
        { name: 'useFinancialYear', label: 'Include financial year (26/27)', type: 'boolean', defaultValue: true },
        { name: 'isDefault', label: 'Default for this document', type: 'boolean' },
        { name: 'isActive', label: 'Active', type: 'boolean', defaultValue: true },
      ]}
    />
  );
}
