"use client";

import { Check, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Outfit } from "@/lib/types";

export function OutfitCard({ outfit }: { outfit: Outfit }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function wear() {
    setState("saving");
    try {
      await api.markWorn(outfit.items.map((i) => i.id));
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <article className="rounded-2xl bg-surface p-3 shadow-sm ring-1 ring-line">
      <h3 className="mb-2 font-semibold">{outfit.title}</h3>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {outfit.items.map((item) => (
          <Link key={item.id} href={`/items/${item.id}`} className="w-24 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.name}
              className="aspect-[3/4] w-full rounded-xl bg-subtle object-cover"
            />
            <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-muted">{item.name}</p>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-sm leading-relaxed">{outfit.explanation}</p>
      {outfit.missingPiece && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <ShoppingBag className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Per completarlo: {outfit.missingPiece}
        </p>
      )}
      <button
        type="button"
        onClick={wear}
        disabled={state === "saving" || state === "done"}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-70"
      >
        {state === "done" ? (
          <>
            <Check className="size-4" aria-hidden /> Buona giornata!
          </>
        ) : state === "error" ? (
          "Riprova"
        ) : (
          "Indosso questo oggi"
        )}
      </button>
    </article>
  );
}
