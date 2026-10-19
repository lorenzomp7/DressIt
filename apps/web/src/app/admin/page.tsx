"use client";

import { AlertTriangle, ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Spinner, useAuth } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";
import {
  CATEGORY_LABELS,
  FORMALITY_LABELS,
  type AdminItem,
  type AdminStats,
  type AdminUser,
  type Category,
} from "@/lib/types";

type Tab = "overview" | "users" | "items";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Panoramica" },
  { id: "users", label: "Utenti" },
  { id: "items", label: "Capi" },
];

const AI_LABELS = { tag: "Analisi foto", outfit: "Stylist" } as const;

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";

const formatMs = (ms: number | null) => (ms == null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

export default function AdminPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [filterUser, setFilterUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    if (user && !user.isAdmin) router.replace("/");
  }, [user, router]);

  if (!user?.isAdmin) return null;

  return (
    <>
      <Link href="/" className="mb-3 flex items-center gap-1 text-sm text-muted">
        <ArrowLeft className="size-4" aria-hidden /> Armadio
      </Link>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Pannello admin</h1>

      <div className="mb-5 flex gap-1 rounded-xl bg-subtle p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-2 py-2 text-sm font-medium ${
              tab === t.id ? "bg-surface shadow-sm" : "text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview />}
      {tab === "users" && (
        <Users
          currentUserId={user.id}
          onShowItems={(u) => {
            setFilterUser(u);
            setTab("items");
          }}
        />
      )}
      {tab === "items" && <Items user={filterUser} onClearUser={() => setFilterUser(null)} />}
    </>
  );
}

function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    load()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Errore di caricamento"));
  }, [load]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

function Loading({ error }: { error: string | null }) {
  if (error) return <p className="text-danger">{error}</p>;
  return (
    <div className="flex justify-center py-12">
      <Spinner />
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Overview() {
  const { data, error } = useLoad<AdminStats>(api.admin.stats);
  if (!data) return <Loading error={error} />;

  const maxCategory = Math.max(1, ...Object.values(data.items.byCategory));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Utenti" value={data.users.total} hint={`+${data.users.last7d} negli ultimi 7 giorni`} />
        <StatCard label="Capi" value={data.items.total} hint={`+${data.items.last7d} negli ultimi 7 giorni`} />
      </div>

      <section>
        <h2 className="mb-2 font-semibold">AI · ultimi 7 giorni</h2>
        <div className="grid grid-cols-2 gap-3">
          {data.ai.map((a) => {
            const errorRate = a.calls7d ? Math.round((a.errors7d / a.calls7d) * 100) : 0;
            return (
              <div key={a.kind} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{AI_LABELS[a.kind]}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{a.calls7d}</p>
                <dl className="mt-2 space-y-0.5 text-xs text-muted">
                  <div className="flex justify-between">
                    <dt>Errori</dt>
                    <dd className={`tabular-nums ${a.errors7d ? "text-danger" : ""}`}>
                      {a.errors7d} ({errorRate}%)
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Latenza media</dt>
                    <dd className="tabular-nums">{formatMs(a.avgLatencyMs)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Latenza p95</dt>
                    <dd className="tabular-nums">{formatMs(a.p95LatencyMs)}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Capi per categoria</h2>
        {Object.keys(data.items.byCategory).length === 0 ? (
          <p className="text-sm text-muted">Nessun capo caricato.</p>
        ) : (
          <ul className="space-y-2 rounded-2xl bg-surface p-4 ring-1 ring-line">
            {Object.entries(data.items.byCategory).map(([cat, n]) => (
              <li key={cat} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span>{CATEGORY_LABELS[cat as Category] ?? cat}</span>
                <span className="h-2 overflow-hidden rounded-full bg-subtle">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(n / maxCategory) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums text-muted">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Ultimi errori AI</h2>
        {data.recentErrors.length === 0 ? (
          <p className="text-sm text-muted">Nessun errore registrato. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {data.recentErrors.map((e, i) => (
              <li key={i} className="flex gap-2 rounded-xl bg-surface p-3 text-sm ring-1 ring-line">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {AI_LABELS[e.kind as keyof typeof AI_LABELS] ?? e.kind} · {e.statusCode ?? "?"} ·{" "}
                    {formatDate(e.createdAt)}
                  </p>
                  <p className="break-words">{e.error}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Users({ currentUserId, onShowItems }: { currentUserId: string; onShowItems: (u: AdminUser) => void }) {
  const { data, error, reload } = useLoad<AdminUser[]>(api.admin.users);
  const [actionError, setActionError] = useState<string | null>(null);
  if (!data) return <Loading error={error} />;

  async function remove(u: AdminUser) {
    if (!confirm(`Eliminare l'account ${u.email} e tutti i suoi ${u.itemCount} capi? L'operazione è definitiva.`)) {
      return;
    }
    setActionError(null);
    try {
      await api.admin.deleteUser(u.id);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Eliminazione non riuscita");
    }
  }

  return (
    <>
      {actionError && <p className="mb-3 text-sm text-danger">{actionError}</p>}
      <ul className="space-y-2">
        {data.map((u) => (
          <li key={u.id} className="rounded-2xl bg-surface p-3 ring-1 ring-line">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.email}
                  {u.id === currentUserId && <span className="ml-1.5 text-xs text-accent">(tu)</span>}
                </p>
                <p className="text-xs text-muted">
                  {u.displayName ? `${u.displayName} · ` : ""}registrato il {formatDate(u.createdAt)}
                </p>
              </div>
              {u.id !== currentUserId && (
                <button
                  type="button"
                  onClick={() => remove(u)}
                  aria-label={`Elimina ${u.email}`}
                  className="shrink-0 rounded-full p-1.5 text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>
                {u.itemCount} capi · {u.aiCalls} chiamate AI · ultimo capo {formatDate(u.lastItemAt)}
              </span>
              {u.itemCount > 0 && (
                <button type="button" onClick={() => onShowItems(u)} className="font-medium text-accent">
                  Vedi capi
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Items({ user, onClearUser }: { user: AdminUser | null; onClearUser: () => void }) {
  const load = useCallback(() => api.admin.items(user?.id), [user?.id]);
  const { data, error } = useLoad<AdminItem[]>(load);

  return (
    <>
      <p className="mb-3 text-sm text-muted">
        {user ? (
          <>
            Capi di <strong className="text-fg">{user.email}</strong> ·{" "}
            <button type="button" onClick={onClearUser} className="text-accent">
              mostra tutti
            </button>
          </>
        ) : (
          "Ultimi 60 capi caricati da tutti gli utenti, con i tag generati dall'AI."
        )}
      </p>
      {!data ? (
        <Loading error={error} />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted">Nessun capo.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((item) => (
            <li key={item.id} className="flex gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.name}
                loading="lazy"
                className="size-24 shrink-0 rounded-xl bg-subtle object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                <p className="truncate text-xs text-muted">
                  {CATEGORY_LABELS[item.category] ?? item.category} · {item.colors.join(", ")} · {item.material}
                </p>
                <p className="text-xs text-muted">
                  {FORMALITY_LABELS[item.formality] ?? item.formality} · calore {item.warmth}/5
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span key={t} className="rounded-full bg-subtle px-2 py-0.5 text-[11px]">
                      {t}
                    </span>
                  ))}
                </p>
                {!user && (
                  <p className="mt-1 truncate text-[11px] text-muted">
                    {item.ownerEmail} · {formatDate(item.createdAt)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
