import { useEffect } from 'react';
import { useSeriesFor, useSeriesPreview } from '../../api/inventory';
import { useAuth } from '../../auth/AuthContext';
import { Field, Input, Select } from '../ui';

export interface DocHeaderValues { firmId: string; branchId: string; seriesId: string; number?: number; date: string; referenceNo?: string | null }

/**
 * Firm / Branch / Series & Number (with live preview) / Date / Reference —
 * the header every numbered document shares. Branch hides when the firm has one branch.
 */
export function DocHeader({ docType, values, onChange, numberLabel = 'Number', extra }: {
  docType: string; values: DocHeaderValues; onChange: (patch: Partial<DocHeaderValues>) => void; numberLabel?: string; extra?: React.ReactNode;
}) {
  const { firms } = useAuth();
  const firm = firms.find((f) => f.id === values.firmId);
  const series = useSeriesFor(docType, values.firmId, values.branchId);
  const preview = useSeriesPreview(values.seriesId, values.date);

  useEffect(() => {
    if (firm && !firm.branches.some((b) => b.id === values.branchId)) onChange({ branchId: firm.branches.find((b) => b.isDefault)?.id ?? firm.branches[0]?.id ?? '' });
  }, [firm?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (series.data && !series.data.some((s) => s.id === values.seriesId)) onChange({ seriesId: series.data.find((s) => s.isDefault)?.id ?? series.data[0]?.id ?? '' });
  }, [series.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (preview.data) onChange({ number: preview.data.number }); }, [preview.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const regulated = preview.data?.seriesType === 'regulated';
  return (
    <>
      <Field label="Firm" required><Select value={values.firmId} onChange={(e) => onChange({ firmId: e.target.value })}>{firms.map((f) => <option key={f.id} value={f.id}>{f.name}{f.isDefault ? ' (Default)' : ''}</option>)}</Select></Field>
      {(firm?.branches.length ?? 0) > 1 && <Field label="Branch" required><Select value={values.branchId} onChange={(e) => onChange({ branchId: e.target.value })}>{firm?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>}
      <div>
        <div className="flex justify-between"><label className="label req">{numberLabel}</label>{preview.data && <span className="text-xs text-ink-muted">Preview: <b className="text-ink">{preview.data.docNo}</b></span>}</div>
        <div className="flex gap-1">
          <Select className="flex-1" value={values.seriesId} onChange={(e) => onChange({ seriesId: e.target.value })}>
            {!series.data?.length && <option value="">No series — add in Settings</option>}
            {series.data?.map((s) => <option key={s.id} value={s.id}>{s.prefix}</option>)}
          </Select>
          <Input className="w-20" type="number" value={values.number ?? ''} readOnly={regulated} title={regulated ? 'Regulated series: number is fixed' : ''} onChange={(e) => onChange({ number: Number(e.target.value) })} />
        </div>
      </div>
      <Field label="Date" required><Input type="date" value={values.date} onChange={(e) => onChange({ date: e.target.value })} /></Field>
      <Field label="Reference No"><Input value={values.referenceNo ?? ''} onChange={(e) => onChange({ referenceNo: e.target.value })} /></Field>
      {extra}
    </>
  );
}

export const today = () => new Date().toISOString().slice(0, 10);
