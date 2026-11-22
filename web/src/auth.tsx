import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, type Me } from './api';

interface AuthState {
  me: Me | null;
  loading: boolean;
  isAdmin: boolean; // catalog management: ADMIN or OWNER
  isOwner: boolean; // user management ("главный админ")
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  me: null, loading: true, isAdmin: false, isOwner: false, refresh: async () => {},
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

  const isOwner = me?.role === 'OWNER';
  const isAdmin = isOwner || me?.role === 'ADMIN';

  return (
    <AuthContext.Provider value={{ me, loading, isAdmin, isOwner, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
