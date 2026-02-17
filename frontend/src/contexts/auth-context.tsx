"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { usePathname, useRouter } from "next/navigation";

import { authApi, clearToken, setToken as storeToken } from "@/lib/api";
import type { User } from "@/types";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PROTECTED_PATHS = ["/companies", "/portfolio"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadUser = useCallback(async (t: string) => {
    storeToken(t);
    setTokenState(t);
    try {
      const u = await authApi.me();
      setUser(u);
    } catch {
      clearToken();
      setTokenState(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("jarvis_token") : null;
    if (stored) {
      setTokenState(stored);
      authApi
        .me()
        .then(setUser)
        .catch(() => {
          clearToken();
          setTokenState(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      await loadUser(res.access_token);
    },
    [loadUser]
  );

  const logout = useCallback(() => {
    clearToken();
    setTokenState(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  // Redirect unauthenticated users away from protected paths
  useEffect(() => {
    if (loading) return;
    if (!isProtectedPath(pathname ?? "")) return;
    const stored = typeof window !== "undefined" ? localStorage.getItem("jarvis_token") : null;
    if (!stored) {
      router.replace("/login");
    }
  }, [loading, pathname, router]);

  const value: AuthContextValue = {
    user,
    token: token ?? (typeof window !== "undefined" ? localStorage.getItem("jarvis_token") : null),
    loading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
