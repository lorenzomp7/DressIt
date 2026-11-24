"use client";

import { ArrowLeft, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner, useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";

/** A guest creates an account: same wardrobe, same wear history, plus email and password. */
export default function AccountPage() {
  const { user, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && !user.isGuest) router.replace("/");
  }, [user, router]);

  if (!user?.isGuest) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.upgrade(email, password, name || undefined);
      signIn(res.token, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Qualcosa è andato storto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="mb-6 flex items-center gap-2">
        <Link href="/" aria-label="Torna all'armadio" className="-ml-2 rounded-full p-2 text-muted">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Crea un account</h1>
      </header>

      <div className="mb-6 flex gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line">
        <UserRound className="size-6 shrink-0 text-accent" aria-hidden />
        <p className="text-sm text-muted">
          Ora usi DressIt come ospite. Con un account l&apos;armadio, i capi indossati e le proposte restano tutti dove
          sono, e potrai entrare da qualsiasi dispositivo con email e password.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          className="input"
          placeholder="Come ti chiami? (opzionale)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          aria-label="Nome (opzionale)"
        />
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          aria-label="Email"
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min. 8 caratteri)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-label="Password"
          minLength={8}
          required
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center rounded-xl bg-accent py-3 font-semibold text-on-accent disabled:opacity-70"
        >
          {busy ? <Spinner className="size-5 text-on-accent" /> : "Crea account e tieni l'armadio"}
        </button>
      </form>
    </>
  );
}
