import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, type Me } from './api';

interface AuthState {
  me: Me | null;
  loading: boolean;
  // Permission check (catalog: src/auth/permissions.ts on the server). The owner can do everything.
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null, loading: true, can: () => false, refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api.me());
    } catch {
      clearToken();
      setMe(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const can = (permission: string) => Boolean(me && (me.role.isOwner || me.permissions.includes(permission)));

  return (
    <AuthContext.Provider value={{ me, loading, can, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export const useCan = () => useAuth().can;
