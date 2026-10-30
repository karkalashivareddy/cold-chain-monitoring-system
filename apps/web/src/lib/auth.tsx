import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SessionUser } from "@frostguard/shared";
import { api, setAccessToken } from "./api";

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface LoginInput {
  email: string;
  password: string;
  organizationSlug?: string;
}

interface LoginResponse {
  user: SessionUser;
  accessToken: string;
  expiresAt: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<SessionUser>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const queryClient = useQueryClient();

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // The httpOnly cookie is sufficient here; the client refreshes it once
        // if the short-lived access cookie has expired.
        const session = await api.get<SessionUser>("/auth/me");
        if (cancelled) return;
        setUser(session);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        setUser(null);
        setStatus("anonymous");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => clearSession();
    window.addEventListener("fg:session-expired", handler);
    return () => window.removeEventListener("fg:session-expired", handler);
  }, [clearSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await api.post<LoginResponse>("/auth/login", input);
      setAccessToken(result.accessToken);
      queryClient.clear();
      setUser(result.user);
      setStatus("authenticated");
      return result.user;
    },
    [queryClient]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // A revoked or expired refresh token still means the browser session ends.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const hasPermission = useCallback(
    (permission: string) => Boolean(user?.permissions.includes(permission)),
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, hasPermission }),
    [user, status, login, logout, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
