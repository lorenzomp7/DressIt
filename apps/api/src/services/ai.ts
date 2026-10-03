import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { config } from "../config.js";
import {
  CATEGORIES,
  clampWarmth,
  FORMALITY,
  GarmentAttributesSchema,
  SEASONS,
  type GarmentAttributes,
  type Item,
} from "../domain.js";
import type { WeatherSummary } from "./weather.js";

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, maxRetries: 2 });

/**
 * If a safety classifier declines a request, the API transparently re-runs it on
 * Anthropic's recommended fallback model instead of returning a refusal.
 */
const FALLBACK: Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, "betas" | "fallbacks"> = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

export class AiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

/** Maps SDK errors to HTTP status codes the routes can return as-is. */
function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError("L'assistente è molto richiesto, riprova tra qualche secondo.", 429);
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError("Configurazione AI non valida (ANTHROPIC_API_KEY).", 500);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AiError("Richiesta non valida per il modello AI.", 400);
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError("Servizio AI temporaneamente non disponibile.", 503);
  }
  return new AiError("Errore imprevisto durante l'analisi AI.", 500);
}

function assertUsable(stopReason: string | null): void {
  if (stopReason === "refusal") {
    throw new AiError("L'AI non ha potuto elaborare questa richiesta.", 422);
  }
  if (stopReason === "max_tokens") {
    throw new AiError("Risposta AI incompleta, riprova.", 502);
  }
}

// ---------------------------------------------------------------------------
// 1. Vision: tag a garment from a photo
// ---------------------------------------------------------------------------

/**
 * Same shape as GarmentAttributesSchema, but tolerant: the SDK passes enums to the model as
 * hints, so an out-of-vocabulary value falls back to a sensible default instead of failing.
 */
const AiGarmentSchema = GarmentAttributesSchema.extend({
  category: z.enum(CATEGORIES).catch("top"),
  seasons: z.array(z.enum(SEASONS)).catch([...SEASONS]),
  formality: z.enum(FORMALITY).catch("casual"),
  warmth: z.number().describe("Da 1 (molto leggero) a 5 (molto caldo)").catch(3),
});

const TaggingSchema = z.object({
  is_clothing: z
    .boolean()
    .describe("false se la foto non mostra un capo d'abbigliamento, scarpe o accessorio"),
  rejection_reason: z.string().describe("Motivo se is_clothing è false, altrimenti stringa vuota"),
  garment: AiGarmentSchema,
});

const TAGGING_SYSTEM = `Sei un esperto di moda e stylist personale. Analizzi la foto di un singolo capo
d'abbigliamento (o scarpe, borsa, accessorio) scattata con uno smartphone e ne estrai attributi
strutturati per un guardaroba digitale.

Linee guida:
- Concentrati sul capo principale e ignora sfondo, grucce, mani o mobili.
- Scrivi tutti i testi in italiano. Il nome è breve e specifico ("Jeans slim blu scuro", "Camicia azzurra di lino").
- I colori sono nomi comuni ("blu navy", "beige", "bianco ottico"), dal più dominante.
- Se materiale o stagionalità non sono certi, dai la stima più plausibile dall'aspetto.
- warmth va da 1 (canotta, sandali) a 5 (piumino, stivali imbottiti).
- Se la foto non contiene un capo d'abbigliamento, imposta is_clothing a false, spiega il motivo
  in rejection_reason e compila garment con valori segnaposto.`;

export async function tagGarment(image: Buffer, mediaType: "image/jpeg"): Promise<GarmentAttributes> {
  try {
    const response = await client.beta.messages.parse({
      ...FALLBACK,
      model: config.ANTHROPIC_MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: betaZodOutputFormat(TaggingSchema) },
      system: TAGGING_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: image.toString("base64") },
            },
            { type: "text", text: "Analizza questo capo e restituisci i suoi attributi." },
          ],
        },
      ],
    });

    assertUsable(response.stop_reason);
    const result = response.parsed_output;
    if (!result) throw new AiError("Risposta AI non valida, riprova.", 502);
    if (!result.is_clothing) {
      throw new AiError(
        result.rejection_reason || "Nella foto non sembra esserci un capo d'abbigliamento.",
        422,
      );
    }
    return { ...result.garment, warmth: clampWarmth(result.garment.warmth) };
  } catch (err) {
    throw toAiError(err);
  }
}

// ---------------------------------------------------------------------------
// 2. Outfit assistant
// ---------------------------------------------------------------------------

const OutfitResponseSchema = z.object({
  reply: z.string().describe("Risposta conversazionale breve e calorosa, in italiano"),
  outfits: z
    .array(
      z.object({
        title: z.string().describe("Nome evocativo dell'outfit, es. 'Smart casual da ufficio'"),
        item_ids: z.array(z.string()).describe("ID esatti dei capi del guardaroba usati"),
        explanation: z.string().describe("Perché funziona: abbinamento colori, meteo, occasione"),
        missing_piece: z
          .string()
          .describe("Capo che migliorerebbe l'outfit ma manca nel guardaroba, altrimenti stringa vuota"),
      }),
    )
    .describe("Da 0 a 3 outfit, ordinati dal migliore"),
});
export type OutfitResponse = z.infer<typeof OutfitResponseSchema>;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface OutfitRequest {
  message: string;
  history: ChatTurn[];
  wardrobe: Item[];
  weather: WeatherSummary | null;
  timezone: string;
}

const STYLIST_SYSTEM = `Sei DressIt, lo stylist personale dell'utente. Il tuo compito è proporre outfit
usando ESCLUSIVAMENTE i capi presenti nel guardaroba dell'utente, elencato più sotto in JSON.

Regole:
- Ogni outfit usa solo ID presenti nel guardaroba, copiati esattamente. Mai inventare capi.
- Un outfit completo ha di norma: (top + bottom) oppure (dress), più shoes. Aggiungi outerwear se
  fa freddo o piove, e accessori/borse solo se valorizzano il look.
- Adatta il calore dei capi (warmth 1-5) a temperatura percepita e precipitazioni.
- Rispetta l'occasione (ufficio → smart_casual/business, palestra → sport, cena elegante → formal).
- Cura l'armonia dei colori e dei pattern; evita più fantasie in conflitto.
- Se possibile preferisci capi non indossati di recente (last_worn) per variare.
- Se il guardaroba non basta per un outfit completo, proponi il migliore possibile, spiegalo nella
  reply e indica in missing_piece cosa servirebbe.
- Se l'utente fa una domanda che non richiede outfit (es. "grazie"), rispondi e lascia outfits vuoto.
- Rispondi sempre in italiano, con tono amichevole e conciso (massimo 3-4 frasi nella reply).`;

function serializeWardrobe(items: Item[]): string {
  const compact = items.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    subcategory: i.subcategory,
    colors: i.colors,
    pattern: i.pattern,
    material: i.material,
    seasons: i.seasons,
    formality: i.formality,
    warmth: i.warmth,
    tags: i.tags,
    last_worn: i.lastWornAt ? i.lastWornAt.slice(0, 10) : null,
  }));
  return JSON.stringify(compact);
}

function describeContext(weather: WeatherSummary | null, timezone: string): string {
  const now = new Date();
  let date: string;
  try {
    date = now.toLocaleString("it-IT", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    date = now.toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  }
  const lines = [`Data e ora: ${date}`];
  if (weather) {
    lines.push(
      `Meteo: ${weather.description}, ${weather.temperatureC}°C (percepiti ${weather.feelsLikeC}°C), ` +
        `min ${weather.minC}°C / max ${weather.maxC}°C, probabilità pioggia ${weather.precipitationProbability}%, ` +
        `vento ${weather.windKmh} km/h`,
    );
  } else {
    lines.push("Meteo: non disponibile (considera la stagione in base alla data)");
  }
  return lines.join("\n");
}

export async function suggestOutfits(req: OutfitRequest): Promise<OutfitResponse> {
  // Stable prefix first (instructions + wardrobe) so it can be served from prompt cache;
  // the volatile context (date, weather) goes into the latest user turn.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: STYLIST_SYSTEM },
    {
      type: "text",
      text: `Guardaroba dell'utente (${req.wardrobe.length} capi):\n${serializeWardrobe(req.wardrobe)}`,
      cache_control: { type: "ephemeral" },
    },
  ];

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...req.history.map((t) => ({ role: t.role, content: t.content })),
    {
      role: "user",
      content: `<contesto>\n${describeContext(req.weather, req.timezone)}\n</contesto>\n\n${req.message}`,
    },
  ];

  try {
    const response = await client.beta.messages.parse({
      ...FALLBACK,
      model: config.ANTHROPIC_MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: betaZodOutputFormat(OutfitResponseSchema) },
      system,
      messages,
    });

    assertUsable(response.stop_reason);
    if (!response.parsed_output) throw new AiError("Risposta AI non valida, riprova.", 502);
    return response.parsed_output;
  } catch (err) {
    throw toAiError(err);
  }
}
