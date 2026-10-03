"use client";

import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";
import {
  CATEGORY_LABELS,
  FORMALITY_LABELS,
  SEASON_LABELS,
  type Category,
  type Formality,
  type Item,
  type Season,
} from "@/lib/types";

const splitList = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export default function ItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [draft, setDraft] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getItem(id)
      .then((i) => {
        setItem(i);
        setDraft(i);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Capo non trovato"));
  }, [id]);

  if (error) return <p className="text-danger">{error}</p>;
  if (!item || !draft) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const set = <K extends keyof Item>(key: K, value: Item[K]) => {
    setSaved(false);
    setDraft({ ...draft, [key]: value });
  };

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateItem(id, {
        name: draft.name,
        category: draft.category,
        subcategory: draft.subcategory,
        colors: draft.colors,
        pattern: draft.pattern,
        material: draft.material,
        seasons: draft.seasons,
        formality: draft.formality,
        warmth: draft.warmth,
        tags: draft.tags,
        description: draft.description,
      });
      setItem(updated);
      setDraft(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Eliminare "${item?.name}" dal tuo armadio?`)) return;
    try {
      await api.deleteItem(id);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Eliminazione non riuscita");
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1 text-sm text-muted">
          <ArrowLeft className="size-4" aria-hidden /> Armadio
        </Link>
        <button type="button" onClick={remove} className="flex items-center gap-1 text-sm text-danger">
          <Trash2 className="size-4" aria-hidden /> Elimina
        </button>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={item.name} className="mb-4 max-h-[50dvh] w-full rounded-2xl bg-subtle object-contain" />
      <p className="mb-5 text-sm text-muted">{item.description}</p>

      <div className="space-y-4">
        <Field label="Nome">
          <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <select
              className="input"
              value={draft.category}
              onChange={(e) => set("category", e.target.value as Category)}
            >
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <input className="input" value={draft.subcategory} onChange={(e) => set("subcategory", e.target.value)} />
          </Field>
        </div>
        <Field label="Colori (separati da virgola)">
          <input
            className="input"
            defaultValue={draft.colors.join(", ")}
            onChange={(e) => set("colors", splitList(e.target.value))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Materiale">
            <input className="input" value={draft.material} onChange={(e) => set("material", e.target.value)} />
          </Field>
          <Field label="Fantasia">
            <input className="input" value={draft.pattern} onChange={(e) => set("pattern", e.target.value)} />
          </Field>
        </div>
        <Field label="Stile">
          <select
            className="input"
            value={draft.formality}
            onChange={(e) => set("formality", e.target.value as Formality)}
          >
            {Object.entries(FORMALITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Calore: ${draft.warmth}/5`}>
          <input
            type="range"
            min={1}
            max={5}
            value={draft.warmth}
            onChange={(e) => set("warmth", Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </Field>
        <Field label="Stagioni">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SEASON_LABELS) as Season[]).map((s) => {
              const on = draft.seasons.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("seasons", on ? draft.seasons.filter((x) => x !== s) : [...draft.seasons, s])}
                  className={`rounded-full px-3 py-1.5 text-sm ring-1 ${
                    on ? "bg-accent text-on-accent ring-accent" : "bg-surface ring-line"
                  }`}
                >
                  {SEASON_LABELS[s]}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Tag (separati da virgola)">
          <input
            className="input"
            defaultValue={draft.tags.join(", ")}
            onChange={(e) => set("tags", splitList(e.target.value))}
          />
        </Field>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex w-full items-center justify-center rounded-xl bg-accent py-3 font-semibold text-on-accent disabled:opacity-70"
        >
          {saving ? <Spinner className="size-5 text-on-accent" /> : saved ? "Salvato ✓" : "Salva modifiche"}
        </button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
