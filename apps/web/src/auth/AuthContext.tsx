import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, UserDto } from '@expense/shared';

const STORAGE_KEY = 'expense-tracker/session';

type Session = { token: string; user: UserDto };

type AuthContextValue = {
  session: Session | undefined;
  signIn: (response: AuthResponse) => void;
  signOut: () => void;
  /**
   * Applies a preference change locally after the server has accepted it.
   *
   * Kept here rather than refetched because the session is already the single
   * source of who the user is; a second copy of their preferences elsewhere
   * would be one more thing able to disagree.
   */
  updateUser: (patch: Partial<UserDto>) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * The token lives in localStorage - a deliberate decision with a known cost.
 *
 * The right answer in production is an httpOnly cookie, which XSS cannot read.
 * That normally needs SameSite=None + Secure and credentialed CORS because the
 * site and the API sit on different origins... except here they do NOT:
 * CloudFront serves both under one host (see the CDK stack), so the cookie is
 * actually viable and it is the first item in "what I would do next".
 *
 * We stayed on localStorage because the real risk is contained: the only XSS
 * surface would be injected HTML, and nothing in this app renders user markup
 * (React escapes by default, and `dangerouslySetInnerHTML` appears nowhere in
 * the codebase).
 */
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
    // localStorage unavailable (a private window with storage blocked) or
    // corrupted JSON: treating it as "signed out" beats breaking app startup.
    return undefined;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | undefined>(readStoredSession);

  const signIn = useCallback((response: AuthResponse) => {
    const next = { token: response.token, user: response.user };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // An in-memory-only session is acceptable degradation; it is lost on reload.
    }
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do - clearing the in-memory state below already ends the session.
    }
    setSession(undefined);
  }, []);

  const updateUser = useCallback((patch: Partial<UserDto>) => {
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, user: { ...current.user, ...patch } };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // In-memory only is acceptable degradation; it is lost on reload.
      }
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

/** Shorthand for queries: the raw token, or undefined when signed out. */
export const useToken = (): string | undefined => useAuth().session?.token;
