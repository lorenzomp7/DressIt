"use client";

import { Camera, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Spinner, useAuth } from "@/components/AuthProvider";
import { ItemCard } from "@/components/ItemCard";
import { api, ApiError } from "@/lib/api";
import { CATEGORY_LABELS, type Category, type Item } from "@/lib/types";

export default function WardrobePage() {
  const { user, signOut } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Category | "all">("all");

  useEffect(() => {
    api
      .listItems()
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Errore di caricamento"));
  }, []);

  const categories = useMemo(
    () => [...new Set((items ?? []).map((i) => i.category))] as Category[],
    [items],
  );
  const visible = filter === "all" ? items : items?.filter((i) => i.category === filter);

  return (
    <>
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Ciao{user?.displayName ? ` ${user.displayName}` : ""} 👋</p>
          <h1 className="text-2xl font-bold tracking-tight">Il tuo armadio</h1>
        </div>
        <button type="button" onClick={signOut} aria-label="Esci" className="rounded-full p-2 text-muted">
          <LogOut className="size-5" />
        </button>
      </header>

      <Link
        href="/assistant?q=Cosa%20mi%20metto%20oggi%3F"
        className="mb-5 flex items-center gap-3 rounded-2xl bg-accent p-4 text-on-accent shadow-sm"
      >
        <Sparkles className="size-6 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Cosa mi metto oggi?</p>
          <p className="text-sm opacity-80">Outfit in base al meteo e ai tuoi capi</p>
        </div>
      </Link>

      {error && <p className="text-danger">{error}</p>}
      {!items && !error && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-line p-8 text-center">
          <Camera className="mx-auto mb-3 size-10 text-muted" aria-hidden />
          <p className="font-medium">Il tuo armadio è vuoto</p>
          <p className="mt-1 text-sm text-muted">Fotografa i tuoi capi: l&apos;AI li cataloga per te.</p>
          <Link href="/add" className="mt-4 inline-block rounded-xl bg-accent px-5 py-2.5 font-semibold text-on-accent">
            Aggiungi il primo capo
          </Link>
        </div>
      )}

      {items && items.length > 0 && (
        <>
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {(["all", ...categories] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ring-1 ${
                  filter === c ? "bg-fg text-bg ring-fg" : "bg-surface text-fg ring-line"
                }`}
              >
                {c === "all" ? `Tutti (${items.length})` : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visible?.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
        </>
      )}
    </>
  );
}
