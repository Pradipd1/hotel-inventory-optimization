import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { tokenStore } from '../services/api.js';
import { authApi } from '../services/endpoints.js';

const AuthContext = createContext(null);

export const ROLES = { ADMIN: 'admin', MANAGER: 'inventory_manager', STAFF: 'staff' };
export const ROLE_LABELS = { admin: 'Administrator', inventory_manager: 'Inventory Manager', staff: 'Staff' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const loadProfile = useCallback(async () => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    try {
      const res = await authApi.me();
      setUser(res.user);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    const onExpired = () => setUser(null);
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [loadProfile]);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* token may already be invalid */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => {
    const role = user?.role;
    return {
      user,
      loading,
      login,
      logout,
      refreshProfile: loadProfile,
      setToken: tokenStore.set,
      hasRole: (...roles) => Boolean(role && roles.includes(role)),
      isAdmin: role === ROLES.ADMIN,
      isManagement: role === ROLES.ADMIN || role === ROLES.MANAGER,
      currency: user?.hotel?.settings?.currency || 'NPR',
    };
  }, [user, loading, login, logout, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
