import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { contactSchema, contactTypes, gstTreatments, type ContactInput } from '@erp/shared';
import { http } from '../../api/client';
import { useSave } from '../../api/hooks';
import { useContactSearch, useCurrencies, useLocations, usePaymentTerms, useSalesPersons } from '../../api/lookups';
import { useAuth } from '../../auth/AuthContext';
import { Button, Checkbox, Field, Input, Select } from '../../components/ui';
import { Section, FormErrors, errorText } from '../../components/form/Section';
import { bind, bindNum, useForm } from '../../components/form/useForm';

const TYPE_LABEL: Record<string, string> = { customer: 'Customer', vendor: 'Vendor', both: 'Customer & Vendor', broker: 'Broker' };
const GST_LABEL: Record<string, string> = { registered_regular: 'Registered Business – Regular', registered_composition: 'Registered Business – Composition', unregistered: 'Unregistered Business', consumer: 'Consumer', overseas: 'Overseas', sez: 'Special Economic Zone', deemed_export: 'Deemed Export' };

const empty = (firmId: string): ContactInput => ({
  firmId, type: 'customer', displayName: '', gstTreatment: 'unregistered', billing: {}, shippingAddresses: [], bank: {}, persons: [],
  discountType: 'flat', discountValue: 0, custom: {}, isActive: true,
});

/** Full contact form — used as a page here and reusable inside a modal for "+ Create New Vendor". */
export function ContactFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  return <ContactForm id={id === 'new' ? undefined : id} onDone={() => nav('/contacts')} />;
}

export function ContactForm({ id, presetType, onDone }: { id?: string; presetType?: ContactInput['type']; onDone: (c: { id: string; displayName: string }) => void }) {
  const { firm, firms } = useAuth();
  const form = useForm<ContactInput>({ ...empty(firm?.id ?? ''), ...(presetType ? { type: presetType } : {}) });
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const save = useSave<{ id: string; displayName: string }>('contacts');

  const existing = useQuery({ queryKey: ['contacts', id], queryFn: () => http.get<ContactInput & { id: string; serialNo: number }>(`/contacts/${id}`), enabled: !!id });
  const nextSerial = useQuery({ queryKey: ['contacts', 'next-serial'], queryFn: () => http.get<{ serialNo: number }>('/contacts/next-serial'), enabled: !id });
  useEffect(() => { if (existing.data) form.reset({ ...existing.data, dob: existing.data.dob ?? null }); }, [existing.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (nextSerial.data && !form.values.serialNo) form.set('serialNo', nextSerial.data.serialNo); }, [nextSerial.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const currencies = useCurrencies(); const terms = usePaymentTerms(); const salesPersons = useSalesPersons();
  const brokers = useContactSearch('broker'); const refs = useContactSearch('all');
  const countries = useLocations('country');
  const states = useLocations('state', form.values.billing.countryId);
  const cities = useLocations('city', form.values.billing.stateId);
  const areas = useLocations('area', form.values.billing.cityId);

  const submit = async () => {
    setError(null);
    const parsed = contactSchema.safeParse(form.values);
    if (!parsed.success) { setError(Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => `${k}: ${v?.join(', ')}`).join(' · ')); return; }
    try { const c = await save.mutateAsync({ id, data: parsed.data }); onDone(c); } catch (e) { setError(errorText(e)); }
  };

  const opt = (rows: { id: string; name?: string; label?: string }[] | undefined) => (rows ?? []).map((r) => <option key={r.id} value={r.id}>{r.label ?? r.name}</option>);

  return (
    <div className="grid gap-4 max-w-6xl">
      <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">{id ? 'Edit Contact' : 'New Contact'}</h1>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => onDone({ id: '', displayName: '' })}>Cancel</Button><Button onClick={submit} disabled={save.isPending}>Save</Button></div></div>
      <FormErrors error={error} />

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Tax detail">
          <Field label="GST Treatment" required><Select {...bind(form, 'gstTreatment')}>{gstTreatments.map((g) => <option key={g} value={g}>{GST_LABEL[g]}</option>)}</Select></Field>
          <Field label="GSTIN"><Input {...bind(form, 'gstin')} /></Field>
          <Field label="PAN"><Input {...bind(form, 'pan')} placeholder="Enter PAN Number" /></Field>
        </Section>
        <Section title="Contact detail">
          <Field label="Firm" required><Select {...bind(form, 'firmId')}>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
          <Field label="Type" required><Select {...bind(form, 'type')}>{contactTypes.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</Select></Field>
          <Field label="Serial No" required><Input type="number" {...bindNum(form, 'serialNo')} /></Field>
          <Field label="Display / Company" required><Input {...bind(form, 'displayName')} /></Field>
          <Field label="Primary Contact Person"><Input {...bind(form, 'primaryContactPerson')} /></Field>
          <Field label="Mobile"><Input {...bind(form, 'mobile')} placeholder="+91" /></Field>
          <Field label="Email"><Input type="email" {...bind(form, 'email')} /></Field>
        </Section>
      </div>

      <div className="flex gap-1 border-b border-line">
        {['Billing address', `Shipping addresses (${form.values.shippingAddresses.length})`, 'Bank details', `Contact persons (${form.values.persons.length})`, 'Other details'].map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className={`px-3 py-2 -mb-px border-b-2 ${tab === i ? 'border-brand text-brand font-medium' : 'border-transparent text-ink-muted hover:text-ink'}`}>{t}</button>
        ))}
      </div>

      {tab === 0 && (
        <Section title="Billing address">
          <div className="md:col-span-3"><Field label="Address"><textarea className="field h-20 py-2" {...bind(form, 'billing.address')} /></Field></div>
          <Field label="Country"><Select {...bind(form, 'billing.countryId')}><option value="">Select country</option>{opt(countries.data)}</Select></Field>
          <Field label="State"><Select {...bind(form, 'billing.stateId')} disabled={!form.values.billing.countryId}><option value="">Select state</option>{opt(states.data)}</Select></Field>
          <Field label="City"><Select {...bind(form, 'billing.cityId')} disabled={!form.values.billing.stateId}><option value="">Select city</option>{opt(cities.data)}</Select></Field>
          <Field label="Area"><Select {...bind(form, 'billing.areaId')} disabled={!form.values.billing.cityId}><option value="">Select city first</option>{opt(areas.data)}</Select></Field>
          <Field label="Pincode"><Input {...bind(form, 'billing.pincode')} /></Field>
          <Field label="Google Map URL"><Input {...bind(form, 'billing.mapUrl')} /></Field>
          <Field label="Latitude"><Input type="number" step="any" {...bindNum(form, 'billing.latitude')} placeholder="e.g. 21.2315" /></Field>
          <Field label="Longitude"><Input type="number" step="any" {...bindNum(form, 'billing.longitude')} placeholder="e.g. 72.8308" /></Field>
        </Section>
      )}

      {tab === 1 && (
        <Section title="Shipping addresses" action={<div className="flex gap-2">
          <Button variant="ghost" className="h-8" onClick={() => form.update((v) => ({ ...v, shippingAddresses: [...v.shippingAddresses, { ...v.billing, companyName: v.displayName, mobile: v.mobile, gstin: v.gstin }] }))}>Copy billing</Button>
          <Button variant="ghost" className="h-8" onClick={() => form.update((v) => ({ ...v, shippingAddresses: [...v.shippingAddresses, {}] }))}>+ Add address</Button></div>}>
          {form.values.shippingAddresses.length === 0 && <p className="md:col-span-3 text-ink-muted">No shipping address. Add one or copy billing.</p>}
          {form.values.shippingAddresses.map((_, i) => (
            <div key={i} className="md:col-span-3 grid gap-3 md:grid-cols-3 rounded-md border border-line p-4 relative">
              <button className="absolute right-3 top-2 text-red-500" onClick={() => form.update((v) => ({ ...v, shippingAddresses: v.shippingAddresses.filter((__, j) => j !== i) }))} aria-label="Remove">×</button>
              <div className="md:col-span-3"><Field label="Address"><textarea className="field h-16 py-2" {...bind(form, `shippingAddresses.${i}.address`)} /></Field></div>
              <Field label="Company Name"><Input {...bind(form, `shippingAddresses.${i}.companyName`)} /></Field>
              <Field label="Mobile"><Input {...bind(form, `shippingAddresses.${i}.mobile`)} /></Field>
              <Field label="GSTIN"><Input {...bind(form, `shippingAddresses.${i}.gstin`)} /></Field>
              <Field label="Pincode"><Input {...bind(form, `shippingAddresses.${i}.pincode`)} /></Field>
              <Field label="Google Map URL"><Input {...bind(form, `shippingAddresses.${i}.mapUrl`)} /></Field>
            </div>
          ))}
        </Section>
      )}

      {tab === 2 && (
        <Section title="Bank details">
          <Field label="Bank Name"><Input {...bind(form, 'bank.bankName')} /></Field>
          <Field label="Account No"><Input {...bind(form, 'bank.accountNo')} /></Field>
          <Field label="Branch"><Input {...bind(form, 'bank.branch')} /></Field>
          <Field label="IFSC / Routing"><Input {...bind(form, 'bank.ifsc')} /></Field>
          <Field label="SWIFT Code"><Input {...bind(form, 'bank.swift')} /></Field>
        </Section>
      )}

      {tab === 3 && (
        <Section title="Contact persons" action={<Button variant="ghost" className="h-8" onClick={() => form.update((v) => ({ ...v, persons: [...v.persons, { name: '', isWhatsapp: false }] }))}>+ Add person</Button>}>
          {form.values.persons.length === 0 && <p className="md:col-span-3 text-ink-muted">No contact persons yet.</p>}
          {form.values.persons.map((p, i) => (
            <div key={i} className="md:col-span-3 grid gap-3 md:grid-cols-3 rounded-md border border-line p-4 relative">
              <button className="absolute right-3 top-2 text-red-500" onClick={() => form.update((v) => ({ ...v, persons: v.persons.filter((__, j) => j !== i) }))} aria-label="Remove">×</button>
              <Field label="Name" required><Input {...bind(form, `persons.${i}.name`)} /></Field>
              <Field label="Mobile"><Input {...bind(form, `persons.${i}.mobile`)} /></Field>
              <Checkbox label="Is WhatsApp Number" checked={p.isWhatsapp} onChange={(e) => form.set(`persons.${i}.isWhatsapp`, e.target.checked)} />
              <Field label="Email"><Input type="email" {...bind(form, `persons.${i}.email`)} /></Field>
              <Field label="Designation"><Input {...bind(form, `persons.${i}.designation`)} /></Field>
              <Field label="Notes"><Input {...bind(form, `persons.${i}.notes`)} /></Field>
            </div>
          ))}
        </Section>
      )}

      {tab === 4 && (
        <Section title="Other details">
          <Field label="DOB"><Input type="date" {...bind(form, 'dob')} /></Field>
          <Field label="Sales Person"><Select {...bind(form, 'salesPersonId')}><option value="">Select or search…</option>{opt(salesPersons.data)}</Select></Field>
          <Field label="Reference"><Select {...bind(form, 'referenceId')}><option value="">Select or search…</option>{opt(refs.data)}</Select></Field>
          <Field label="Broker"><Select {...bind(form, 'brokerId')}><option value="">Select or search…</option>{opt(brokers.data)}</Select></Field>
          <Field label="Discount"><div className="flex gap-2">
            <Select className="w-24" {...bind(form, 'discountType')}><option value="flat">Flat</option><option value="percent">%</option></Select>
            <Input type="number" {...bindNum(form, 'discountValue')} /></div></Field>
          <Field label="Payment Terms"><Select {...bind(form, 'paymentTermsId')}><option value="">Custom</option>{(terms.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.days} days)</option>)}</Select></Field>
          {!form.values.paymentTermsId && <Field label="Custom due days"><Input type="number" {...bindNum(form, 'customDueDays')} /></Field>}
          <Field label="Credit Limit"><div className="flex gap-2">
            <Select className="w-28" {...bind(form, 'creditLimitCurrencyId')}><option value="">—</option>{(currencies.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select>
            <Input type="number" {...bindNum(form, 'creditLimitAmount')} placeholder="Amount" /></div></Field>
          <Field label="Default TDS %"><Input type="number" step="any" {...bindNum(form, 'defaultTdsRate')} /></Field>
          <Field label="Default TCS %"><Input type="number" step="any" {...bindNum(form, 'defaultTcsRate')} /></Field>
          <div className="md:col-span-3"><Field label="Remark"><textarea className="field h-20 py-2" {...bind(form, 'remark')} /></Field></div>
          <Checkbox label="Active" checked={form.values.isActive} onChange={(e) => form.set('isActive', e.target.checked)} />
        </Section>
      )}
    </div>
  );
}
