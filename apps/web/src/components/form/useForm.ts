import { useCallback, useState } from 'react';

/**
 * Tiny form state for large nested forms (contacts, products).
 * `set('billing.pincode', v)` updates nested paths; arrays handled via `update`.
 */
export function useForm<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = useCallback((path: string, value: unknown) => {
    setValues((prev) => {
      const next = structuredClone(prev) as Record<string, unknown>;
      const keys = path.split('.');
      let cur: Record<string, unknown> = next;
      for (const k of keys.slice(0, -1)) cur = (cur[k] ??= {}) as Record<string, unknown>;
      cur[keys[keys.length - 1]!] = value;
      return next as T;
    });
  }, []);
  const update = useCallback((fn: (prev: T) => T) => setValues((p) => fn(structuredClone(p))), []);
  const get = (path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], values);
  return { values, set, update, get, reset: setValues };
}

export const bind = (form: { get: (p: string) => unknown; set: (p: string, v: unknown) => void }, path: string) => ({
  value: String(form.get(path) ?? ''),
  onChange: (e: { target: { value: string } }) => form.set(path, e.target.value),
});
export const bindNum = (form: { get: (p: string) => unknown; set: (p: string, v: unknown) => void }, path: string) => ({
  value: String(form.get(path) ?? ''),
  onChange: (e: { target: { value: string } }) => form.set(path, e.target.value === '' ? null : Number(e.target.value)),
});
