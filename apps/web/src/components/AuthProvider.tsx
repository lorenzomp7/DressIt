"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setUnauthorizedHandler, tokenStore, wakeUpApi } from "@/lib/api";
import { useCleanPathname } from "@/lib/path";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const PUBLIC_ROUTES = ["/login"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = useCleanPathname();

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    router.replace("/login");
  }, [router]);

  const signIn = useCallback(
    (token: string, u: User) => {
      tokenStore.set(token);
      setUser(u);
      router.replace("/");
    },
    [router],
  );

  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    // Free hosting puts the API to sleep: start waking it while the user reads or types.
    wakeUpApi();
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => tokenStore.set(null))
      .finally(() => setLoading(false));
  }, []);

  // Route guard: everything except /login requires a session.
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_ROUTES.includes(pathname);
    if (!user && !isPublic) router.replace("/login");
    if (user && isPublic) router.replace("/");
  }, [loading, user, pathname, router]);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  return (
    <AuthContext.Provider value={value}>
      {loading || (!user && !isPublic) ? (
        <div className="flex min-h-dvh items-center justify-center">
          <Spinner />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Caricamento"
      className={`inline-block size-6 animate-spin rounded-full border-2 border-current border-t-transparent text-accent ${className}`}
    />
  );
}
