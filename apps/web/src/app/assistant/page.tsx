"use client";

import { CloudSun, MapPin, Send, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/AuthProvider";
import { OutfitCard } from "@/components/OutfitCard";
import { api, ApiError } from "@/lib/api";
import { getLocation, type Coords } from "@/lib/location";
import type { Outfit, Weather } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
  outfits?: Outfit[];
  error?: boolean;
}

const SUGGESTIONS = [
  "Cosa mi metto oggi per l'ufficio?",
  "Outfit casual per il weekend",
  "Ho una cena elegante stasera",
  "Look comodo per viaggiare",
];

/** What the model sees of its own past turns: the reply plus the outfits it proposed. */
function toHistoryContent(m: Message): string {
  if (!m.outfits?.length) return m.content;
  const outfits = m.outfits
    .map((o) => `- ${o.title}: ${o.items.map((i) => `${i.name} [${i.id}]`).join(", ")}`)
    .join("\n");
  return `${m.content}\n\nOutfit proposti:\n${outfits}`;
}

function Assistant() {
  const params = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [useWeather, setUseWeather] = useState(true);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: toHistoryContent(m) }));
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setBusy(true);

    try {
      let location = coords;
      if (useWeather && !location) {
        location = await getLocation();
        setCoords(location);
        if (!location) setUseWeather(false);
      }
      const res = await api.suggest({
        message,
        history,
        location: useWeather && location ? location : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (res.weather) setWeather(res.weather);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply, outfits: res.outfits }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof ApiError ? err.message : "Qualcosa è andato storto, riprova.",
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // Deep link from the home card: /assistant?q=...
  useEffect(() => {
    const q = params.get("q");
    if (q && !autoSent.current) {
      autoSent.current = true;
      void send(q);
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="size-6 text-accent" aria-hidden /> Stylist
        </h1>
        <button
          type="button"
          onClick={() => setUseWeather(!useWeather)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${
            useWeather ? "bg-accent/10 text-accent ring-accent/40" : "text-muted ring-line"
          }`}
          aria-pressed={useWeather}
        >
          {weather && useWeather ? (
            <>
              <CloudSun className="size-4" aria-hidden /> {weather.temperatureC}°C · {weather.description}
            </>
          ) : (
            <>
              <MapPin className="size-4" aria-hidden /> Meteo {useWeather ? "attivo" : "spento"}
            </>
          )}
        </button>
      </header>

      <div className="flex-1 space-y-4">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
            <p className="font-medium">Ciao! Sono il tuo stylist personale.</p>
            <p className="mt-1 text-sm text-muted">
              Dimmi dove devi andare e ti preparo l&apos;outfit con i capi del tuo armadio, tenendo conto del
              meteo.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full bg-subtle px-3 py-1.5 text-left text-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-on-accent">
              {m.content}
            </p>
          ) : (
            <div key={i} className="space-y-3">
              <p
                className={`w-fit max-w-[90%] rounded-2xl rounded-bl-md px-4 py-2.5 ring-1 ring-line ${
                  m.error ? "bg-surface text-danger" : "bg-surface"
                }`}
              >
                {m.content}
              </p>
              {m.outfits?.map((o, j) => <OutfitCard key={j} outfit={o} />)}
            </div>
          ),
        )}

        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4" /> Sto scegliendo tra i tuoi capi…
          </p>
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-24 mt-4 flex gap-2 rounded-2xl bg-surface p-2 shadow-lg ring-1 ring-line"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Es. cosa mi metto per un colloquio?"
          className="min-w-0 flex-1 bg-transparent px-2 text-base outline-none"
          maxLength={1000}
          enterKeyHint="send"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Invia"
          className="flex size-10 items-center justify-center rounded-xl bg-accent text-on-accent disabled:opacity-50"
        >
          <Send className="size-5" aria-hidden />
        </button>
      </form>
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense>
      <Assistant />
    </Suspense>
  );
}
