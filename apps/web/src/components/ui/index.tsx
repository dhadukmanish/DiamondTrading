import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect } from 'react';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'bg-white border border-line text-ink hover:bg-canvas',
  ghost: 'text-brand hover:bg-brand-soft',
  danger: 'text-red-600 hover:bg-red-50',
};
export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...p} className={cx('inline-flex items-center gap-1.5 h-10 px-4 rounded-md font-medium disabled:opacity-50 disabled:pointer-events-none', variants[variant], className)} />;
}

export function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className={cx('label', required && 'req')}>{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx('field', p.className)} />;
export const Select = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx('field', p.className)}>{children}</select>;
export const Checkbox = ({ label, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="inline-flex items-center gap-2 h-10 text-ink">
    <input type="checkbox" {...p} className="h-4 w-4 rounded border-line text-brand" />{label}
  </label>
);

export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'blue' | 'orange' | 'red'; children: ReactNode }) {
  const tones = { gray: 'bg-gray-100 text-ink-muted', green: 'bg-green-50 text-green-700', blue: 'bg-brand-soft text-brand', orange: 'bg-orange-50 text-orange-600', red: 'bg-red-50 text-red-600' };
  return <span className={cx('inline-block px-2 py-0.5 rounded text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Modal({ open, title, subtitle, onClose, children, footer, wide }: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 p-4 overflow-y-auto" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={cx('card w-full mt-10 shadow-xl', wide ? 'max-w-4xl' : 'max-w-xl')}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-line">
          <div><h2 className="text-lg font-semibold">{title}</h2>{subtitle && <p className="text-ink-muted text-xs">{subtitle}</p>}</div>
          <button onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 grid gap-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-6 py-4 border-t border-line">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="py-16 text-center text-ink-muted"><p className="mb-3">{title}</p>{action}</div>;
}
