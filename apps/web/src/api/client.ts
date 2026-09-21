const TOKEN_KEY = 'erp.token';
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

/** Thin fetch wrapper: JSON in/out, bearer token, normalized errors. */
export async function api<T>(path: string, init: RequestInit & { query?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const token = tokenStore.get();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
    body: init.body && typeof init.body !== 'string' ? JSON.stringify(init.body) : init.body,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(res.status, data.code ?? 'ERROR', data.message ?? res.statusText, data.details);
  }
  return data as T;
}

export const http = {
  get: <T>(p: string, query?: Record<string, unknown>) => api<T>(p, { query }),
  post: <T>(p: string, body: unknown) => api<T>(p, { method: 'POST', body: body as BodyInit }),
  put: <T>(p: string, body: unknown) => api<T>(p, { method: 'PUT', body: body as BodyInit }),
  del: (p: string) => api<void>(p, { method: 'DELETE' }),
};
