"use client";

import { Shirt } from "lucide-react";
import { useState } from "react";
import { Spinner, useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await api.login(email, password)
          : await api.register(email, password, name || undefined);
      signIn(res.token, res.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Qualcosa è andato storto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[85dvh] flex-col justify-center">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-accent text-on-accent">
          <Shirt className="size-8" aria-hidden />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">DressIt</h1>
        <p className="mt-2 text-muted">Il tuo armadio, con uno stylist AI dentro.</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <input
            className="input"
            placeholder="Come ti chiami? (opzionale)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
          />
        )}
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min. 8 caratteri)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center rounded-xl bg-accent py-3 font-semibold text-on-accent disabled:opacity-70"
        >
          {busy ? <Spinner className="size-5 text-on-accent" /> : mode === "login" ? "Accedi" : "Crea account"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
        className="mt-6 text-sm text-muted underline-offset-4 hover:underline"
      >
        {mode === "login" ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
      </button>
    </div>
  );
}
