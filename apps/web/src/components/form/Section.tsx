import type { ReactNode } from 'react';

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <h2 className="text-[13px] font-semibold tracking-wide text-ink-muted">{title}</h2>{action}
      </div>
      <div className="p-5 grid gap-4 md:grid-cols-3">{children}</div>
    </section>
  );
}

export function FormErrors({ error }: { error: string | null }) {
  return error ? <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p> : null;
}

/** ApiError → readable text incl. zod field errors. */
export function errorText(e: unknown): string {
  const err = e as { message?: string; details?: { fieldErrors?: Record<string, string[]> } };
  const fe = err.details?.fieldErrors;
  return fe ? Object.entries(fe).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ') : err.message ?? 'Something went wrong';
}
