"use client";

import { AlertCircle, Camera, CheckCircle2, ImagePlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/AuthProvider";
import { api, ApiError } from "@/lib/api";
import { prepareImage } from "@/lib/image";
import { CATEGORY_LABELS, type Item } from "@/lib/types";

interface Upload {
  key: string;
  preview: string;
  status: "queued" | "analyzing" | "done" | "error";
  item?: Item;
  error?: string;
}

export default function AddPage() {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const queue = useRef<{ key: string; file: File }[]>([]);
  const running = useRef(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const patch = (key: string, data: Partial<Upload>) =>
    setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, ...data } : u)));

  /** Uploads one photo at a time: AI tagging takes a few seconds per garment. */
  async function drain() {
    if (running.current) return;
    running.current = true;
    while (queue.current.length > 0) {
      const { key, file } = queue.current.shift()!;
      patch(key, { status: "analyzing" });
      try {
        const item = await api.uploadItem(await prepareImage(file), file.name || "capo.jpg");
        patch(key, { status: "done", item });
      } catch (err) {
        patch(key, {
          status: "error",
          error: err instanceof ApiError ? err.message : "Caricamento non riuscito",
        });
      }
    }
    running.current = false;
  }

  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const added = Array.from(files).map((file) => ({
      key: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
    }));
    queue.current.push(...added.map(({ key, file }) => ({ key, file })));
    setUploads((prev) => [
      ...added.map(({ key, preview }) => ({ key, preview, status: "queued" as const })),
      ...prev,
    ]);
    void drain();
  }

  useEffect(() => () => uploads.forEach((u) => URL.revokeObjectURL(u.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Aggiungi capi</h1>
      <p className="mb-5 text-sm text-muted">
        Fotografa un capo alla volta su uno sfondo semplice: l&apos;AI riconosce tipo, colori, materiale
        e stile.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraInput.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl bg-accent p-6 font-semibold text-on-accent"
        >
          <Camera className="size-8" aria-hidden />
          Scatta foto
        </button>
        <button
          type="button"
          onClick={() => galleryInput.current?.click()}
          className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-6 font-semibold ring-1 ring-line"
        >
          <ImagePlus className="size-8" aria-hidden />
          Dalla galleria
        </button>
      </div>

      {/* capture="environment" opens the rear camera directly on mobile */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {uploads.length > 0 && (
        <ul className="mt-6 space-y-3">
          {uploads.map((u) => (
            <li key={u.key} className="flex gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.preview} alt="" className="size-20 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1 self-center">
                {u.status === "queued" && <p className="text-sm text-muted">In coda…</p>}
                {u.status === "analyzing" && (
                  <p className="flex items-center gap-2 text-sm">
                    <Spinner className="size-4" /> L&apos;AI sta analizzando il capo…
                  </p>
                )}
                {u.status === "done" && u.item && (
                  <Link href={`/items/${u.item.id}`} className="block">
                    <p className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden />
                      <span className="truncate">{u.item.name}</span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {CATEGORY_LABELS[u.item.category]} · {u.item.colors.join(", ")}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1">
                      {u.item.tags.slice(0, 4).map((t) => (
                        <span key={t} className="rounded-full bg-subtle px-2 py-0.5 text-[11px]">
                          {t}
                        </span>
                      ))}
                    </p>
                  </Link>
                )}
                {u.status === "error" && (
                  <p className="flex items-start gap-1.5 text-sm text-danger">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {u.error}
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
