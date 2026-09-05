import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, UserDto } from '@expense/shared';

const STORAGE_KEY = 'expense-tracker/session';

type Session = { token: string; user: UserDto };

type AuthContextValue = {
  session: Session | undefined;
  signIn: (response: AuthResponse) => void;
  signOut: () => void;
  updateUser: (patch: Partial<UserDto>) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'token' in parsed &&
      typeof parsed.token === 'string'
    ) {
      return parsed as Session;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | undefined>(readStoredSession);

  const signIn = useCallback((response: AuthResponse) => {
    const next = { token: response.token, user: response.user };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setSession(undefined);
  }, []);

  const updateUser = useCallback((patch: Partial<UserDto>) => {
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, user: { ...current.user, ...patch } };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ session, signIn, signOut, updateUser }),
    [session, signIn, signOut, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

export const useToken = (): string | undefined => useAuth().session?.token;
