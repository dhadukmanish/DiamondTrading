import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@erp/shared';
import { http, tokenStore } from '../api/client';

export interface Firm { id: string; name: string; isDefault: boolean; dateFormat: string; branches: { id: string; name: string; isDefault: boolean }[] }

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  firms: Firm[];
  firm: Firm | null;
  setFirm: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (perm: string) => boolean;
}

const Ctx = createContext<AuthState>(null!);
const FIRM_KEY = 'erp.firmId';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [firmId, setFirmId] = useState<string | null>(localStorage.getItem(FIRM_KEY));
  const [loading, setLoading] = useState(!!tokenStore.get());

  const loadSession = useCallback(async () => {
    try {
      const me = await http.get<AuthUser>('/auth/me');
      const f = await http.get<Firm[]>('/my/firms');
      setUser(me); setFirms(f);
      setFirmId((cur) => (cur && f.some((x) => x.id === cur) ? cur : (me.defaultFirmId ?? f.find((x) => x.isDefault)?.id ?? f[0]?.id ?? null)));
    } catch { tokenStore.clear(); setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (tokenStore.get()) void loadSession(); }, [loadSession]);
  useEffect(() => { if (firmId) localStorage.setItem(FIRM_KEY, firmId); }, [firmId]);

  const value = useMemo<AuthState>(() => ({
    user, loading, firms,
    firm: firms.find((f) => f.id === firmId) ?? null,
    setFirm: setFirmId,
    login: async (email, password) => {
      const { token } = await http.post<{ token: string; user: AuthUser }>('/auth/login', { email, password });
      tokenStore.set(token);
      setLoading(true);
      await loadSession();
    },
    logout: () => { tokenStore.clear(); setUser(null); setFirms([]); },
    can: (perm) => !!user && (user.permissions.includes('*') || user.permissions.includes(perm)),
  }), [user, loading, firms, firmId, loadSession]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
