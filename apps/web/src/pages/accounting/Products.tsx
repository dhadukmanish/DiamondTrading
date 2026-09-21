import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { productSchema, stockStatuses, stockTypes, type ProductInput } from '@erp/shared';
import { http } from '../../api/client';
import { useList, useRemove, useSave } from '../../api/hooks';
import { useAccounts, useCategories, useCurrencies, useTaxRates, useUnits } from '../../api/lookups';
import { useAuth } from '../../auth/AuthContext';
import { DataTable } from '../../components/DataTable';
import { Badge, Button, Checkbox, Field, Input, Select } from '../../components/ui';
import { Section, FormErrors, errorText } from '../../components/form/Section';
import { bind, bindNum, useForm } from '../../components/form/useForm';

interface Variant { id: string; name: string; sku: string; purchasePrice: number; sellingPrice: number; stockReminder: number; category: string | null; stock: number; avgRate: number }
interface Row { id: string; serialNo: number; name: string; productType: string; stockType: string; stockStatus: string; unitId: string | null; purchasePrice: number; salesPrice: number; currencyId: string; variants: Variant[]; stock: number; avgRate: number; isActive: boolean }

const label = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const STATUS_TONE: Record<string, 'green' | 'red' | 'orange' | 'gray'> = { available: 'green', stock_out: 'red', temporary_stock_out: 'orange', disabled: 'gray' };

export function ProductsListPage() {
  const nav = useNavigate();
  const [params, setParams] = useState<{ page: number; pageSize: number; search: string; sort?: string }>({ page: 1, pageSize: 20, search: '' });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const list = useList<Row>('products', params);
  const remove = useRemove('products');
  const units = useUnits(); const currencies = useCurrencies();
  const sym = (id: string) => currencies.data?.find((c) => c.id === id)?.symbol ?? '';
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <DataTable<Row> title="Products" columns={[
      { key: 'name', header: 'Name', sortable: true, render: (r) => (
        <div>
          <button className="font-medium text-left" onClick={() => toggle(r.id)}><span className="inline-block w-4 text-ink-faint">{open.has(r.id) ? '▾' : '▸'}</span>{r.name}</button>
          <div className="text-xs text-ink-muted ml-4">#{r.serialNo} · {label(r.stockType)}{r.productType === 'service' ? ' · Service' : ''}</div>
          {open.has(r.id) && (
            <table className="mt-2 ml-4 text-xs w-full max-w-2xl"><thead className="text-ink-muted"><tr><th className="text-left pr-3 py-1">Sub-product</th><th className="text-left pr-3">SKU</th><th className="text-right pr-3">Purchase</th><th className="text-right pr-3">Sales</th><th className="text-right pr-3">Stock</th><th className="text-left">Category</th></tr></thead>
              <tbody>{r.variants.map((v) => <tr key={v.id} className="border-t border-line"><td className="pr-3 py-1">{v.name}</td><td className="pr-3"><code>{v.sku}</code></td><td className="text-right pr-3">{v.purchasePrice}</td><td className="text-right pr-3">{v.sellingPrice}</td><td className="text-right pr-3">{v.stock}</td><td>{v.category ?? ''}</td></tr>)}</tbody></table>
          )}
        </div>) },
      { key: 'unit', header: 'Unit', render: (r) => units.data?.find((u) => u.id === r.unitId)?.code ?? '' },
      { key: 'purchasePrice', header: 'Purchase', className: 'text-right', render: (r) => `${sym(r.currencyId)}${r.purchasePrice}` },
      { key: 'salesPrice', header: 'Sales', className: 'text-right', render: (r) => `${sym(r.currencyId)}${r.salesPrice}` },
      { key: 'stock', header: 'Stock', className: 'text-right', render: (r) => r.variants.reduce((n, v) => n + v.stock, 0) },
      { key: 'stockStatus', header: 'Stock Status', sortable: true, render: (r) => <Badge tone={STATUS_TONE[r.stockStatus]}>{label(r.stockStatus)}</Badge> },
    ]}
      data={list.data} loading={list.isLoading} params={params} onParams={setParams}
      onAdd={() => nav('/accounting/products/new')} onEdit={(r) => nav(`/accounting/products/${r.id}`)}
      onDelete={async (r) => { if (confirm(`Delete ${r.name}?`)) await remove.mutateAsync(r.id); }}
      searchPlaceholder="Search by name, SKU, HSN…" />
  );
}

const empty = (currencyId: string): ProductInput => ({
  productType: 'goods', stockType: 'general', stockStatus: 'available', name: '', categoryIds: [], purchaseEnabled: true, purchasePrice: 0, salesEnabled: true, salesPrice: 0,
  currencyId, inventoryTracked: true, trackingType: 'sku', custom: {}, variants: [], isActive: true,
});

export function ProductFormPage() {
  const { id: rawId } = useParams(); const id = rawId === 'new' ? undefined : rawId;
  const nav = useNavigate();
  return <ProductForm id={id} onDone={() => nav('/accounting/products')} />;
}

/** Full product form; also reusable in a modal from transaction lines ("Create Product"). */
export function ProductForm({ id, onDone }: { id?: string; onDone: (p: { id: string }) => void }) {
  const { firm } = useAuth();
  const currencies = useCurrencies(); const units = useUnits(); const taxes = useTaxRates(); const categories = useCategories();
  const accounts = useAccounts({ firmId: firm?.id, postable: true });
  const form = useForm<ProductInput>(empty(''));
  const [error, setError] = useState<string | null>(null);
  const save = useSave<{ id: string }>('products');
  const existing = useQuery({ queryKey: ['products', id], queryFn: () => http.get<ProductInput & { id: string; serialNo: number }>(`/products/${id}`), enabled: !!id });

  useEffect(() => { if (existing.data) form.reset(existing.data); }, [existing.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (id || !accounts.data || !currencies.data) return;
    form.update((v) => ({ ...v,
      currencyId: v.currencyId || (currencies.data.find((c) => c.code === 'INR')?.id ?? ''),
      purchaseAccountId: v.purchaseAccountId ?? accounts.data.find((a) => a.systemKey === 'cogs')?.id ?? null,
      salesAccountId: v.salesAccountId ?? accounts.data.find((a) => a.systemKey === 'sales')?.id ?? null,
      taxRateId: v.taxRateId ?? taxes.data?.find((t) => t.name === 'GST 0%')?.id ?? null,
    }));
  }, [accounts.data, currencies.data, taxes.data, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isService = form.values.productType === 'service';
  const v = form.values;
  const submit = async () => {
    setError(null);
    const parsed = productSchema.safeParse(v);
    if (!parsed.success) { setError(Object.entries(parsed.error.flatten().fieldErrors).map(([k, e]) => `${k}: ${e?.join(', ')}`).join(' · ')); return; }
    try { onDone(await save.mutateAsync({ id, data: parsed.data })); } catch (e) { setError(errorText(e)); }
  };
  const accOpts = (accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.subType})</option>);

  return (
    <div className="grid gap-4 max-w-6xl">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">{id ? 'Edit Product' : 'Create Product'}</h1>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => onDone({ id: '' })}>Cancel</Button><Button onClick={submit} disabled={save.isPending}>Save</Button></div></div>
      <FormErrors error={error} />
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Section title="Basic information">
          <Field label="Product Type"><div className="grid grid-cols-2 rounded-md border border-line overflow-hidden h-10">
            {(['service', 'goods'] as const).map((t) => <button key={t} type="button" onClick={() => form.set('productType', t)} className={`capitalize ${v.productType === t ? 'bg-white text-brand font-medium' : 'bg-canvas text-ink-muted'}`}>{t}</button>)}</div></Field>
          <Field label="Stock Status"><Select {...bind(form, 'stockStatus')}>{stockStatuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
          <Field label="Stock Type"><Select {...bind(form, 'stockType')}>{stockTypes.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
          <div className="md:col-span-2"><Field label="Product Name" required><Input {...bind(form, 'name')} /></Field></div>
          <Field label="Serial No."><Input type="number" {...bindNum(form, 'serialNo')} placeholder="Auto" /></Field>
          <Field label="Unit"><Select {...bind(form, 'unitId')}><option value="">Select unit</option>{(units.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.code} – {u.name}</option>)}</Select></Field>
          <Field label={isService ? 'SAC Code' : 'HSN Code'}><Input {...bind(form, 'hsnSac')} placeholder={isService ? 'e.g. 998311' : 'e.g. 7102'} /></Field>
          <Field label="Category"><Select multiple className="field h-24" value={v.categoryIds} onChange={(e) => form.set('categoryIds', [...e.target.selectedOptions].map((o) => o.value))}>{(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <div className="md:col-span-3"><Field label="Short Description"><textarea className="field h-16 py-2" {...bind(form, 'shortDescription')} placeholder="Briefly describe…" /></Field></div>
          <div className="md:col-span-3"><Field label="Product Details"><textarea className="field h-24 py-2" {...bind(form, 'details')} placeholder="Detailed description shown on the public shop product page…" /></Field></div>
        </Section>
        <Section title="Commercials">
          <div className="md:col-span-3 rounded-md border border-line p-4 grid gap-3">
            <Checkbox label="Purchase" checked={v.purchaseEnabled} onChange={(e) => form.set('purchaseEnabled', e.target.checked)} />
            {v.purchaseEnabled && <><Field label="Account" required><Select {...bind(form, 'purchaseAccountId')}><option value="">Select</option>{accOpts}</Select></Field><Field label="Price"><Input type="number" step="any" {...bindNum(form, 'purchasePrice')} /></Field></>}
          </div>
          <div className="md:col-span-3 rounded-md border border-line p-4 grid gap-3">
            <Checkbox label="Sales" checked={v.salesEnabled} onChange={(e) => form.set('salesEnabled', e.target.checked)} />
            {v.salesEnabled && <><Field label="Account" required><Select {...bind(form, 'salesAccountId')}><option value="">Select</option>{accOpts}</Select></Field><Field label="Price"><Input type="number" step="any" {...bindNum(form, 'salesPrice')} /></Field></>}
          </div>
          <div className="md:col-span-3"><Field label="Currency" required><Select {...bind(form, 'currencyId')}><option value="">Select currency</option>{(currencies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}</Select></Field></div>
          <div className="md:col-span-3"><Field label="M.R.P."><Input type="number" step="any" {...bindNum(form, 'mrp')} /></Field></div>
          <div className="md:col-span-3"><Field label="Tax"><Select {...bind(form, 'taxRateId')}><option value="">None</option>{(taxes.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field></div>
        </Section>
      </div>

      {!isService && (
        <Section title="Inventory" action={<Checkbox label="Track inventory" checked={v.inventoryTracked} onChange={(e) => form.set('inventoryTracked', e.target.checked)} />}>
          {v.inventoryTracked && <Field label="Tracking Type"><Select {...bind(form, 'trackingType')}><option value="sku">SKU Tracking (Per Sub-Product Unique Number)</option></Select></Field>}
        </Section>
      )}

      <Section title="Sub-products" action={<Button variant="ghost" className="h-8" onClick={() => form.update((p) => ({ ...p, variants: [...p.variants, { name: '', purchasePrice: p.purchasePrice, sellingPrice: p.salesPrice, stockReminder: 0, custom: {}, isActive: true }] }))}>+ Add Sub-Product</Button>}>
        <div className="md:col-span-3 overflow-x-auto">
          {v.variants.length === 0 ? <p className="text-ink-muted">No sub-products — one will be created automatically from the product name.</p> : (
            <table className="w-full text-left"><thead className="text-xs text-ink-muted"><tr><th className="pr-2 py-1">Sub-Product Name *</th><th className="pr-2">SKU</th><th className="pr-2">Purchase Price</th><th className="pr-2">Selling Price</th><th className="pr-2">Stock Reminder</th><th className="pr-2">Category</th><th /></tr></thead>
              <tbody>{v.variants.map((_, i) => (
                <tr key={i}>
                  <td className="pr-2 py-1"><Input {...bind(form, `variants.${i}.name`)} placeholder="Auto from template if blank" /></td>
                  <td className="pr-2"><Input {...bind(form, `variants.${i}.sku`)} placeholder="Auto" /></td>
                  <td className="pr-2"><Input type="number" step="any" {...bindNum(form, `variants.${i}.purchasePrice`)} /></td>
                  <td className="pr-2"><Input type="number" step="any" {...bindNum(form, `variants.${i}.sellingPrice`)} /></td>
                  <td className="pr-2"><Input type="number" step="any" {...bindNum(form, `variants.${i}.stockReminder`)} /></td>
                  <td className="pr-2"><Select {...bind(form, `variants.${i}.category`)}><option value="">—</option>{['CVD', 'HPHT', 'NATURAL'].map((c) => <option key={c}>{c}</option>)}</Select></td>
                  <td><Button variant="danger" className="px-2" onClick={() => form.update((p) => ({ ...p, variants: p.variants.filter((__, j) => j !== i) }))}>×</Button></td>
                </tr>))}</tbody></table>
          )}
        </div>
      </Section>
    </div>
  );
}
