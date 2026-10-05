import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
} from "@google/genai";
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

const ai = new GoogleGenAI({
  apiKey: config.GEMINI_API_KEY,
  httpOptions: config.GEMINI_BASE_URL ? { baseUrl: config.GEMINI_BASE_URL } : undefined,
});

export class AiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

/** Maps Gemini SDK errors to HTTP status codes the routes can return as-is. */
function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return new AiError("L'assistente è molto richiesto, riprova tra qualche secondo.", 429);
    }
    if (err.status === 401 || err.status === 403) {
      return new AiError("Configurazione AI non valida (GEMINI_API_KEY).", 500);
    }
    if (err.status === 400) return new AiError("Richiesta non valida per il modello AI.", 400);
    return new AiError("Servizio AI temporaneamente non disponibile.", 503);
  }
  return new AiError("Errore imprevisto durante l'analisi AI.", 500);
}

/** Keywords Zod emits that Gemini's responseJsonSchema does not support. */
const UNSUPPORTED_KEYWORDS = new Set(["$schema", "default"]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => !UNSUPPORTED_KEYWORDS.has(key))
        .map(([key, value]) => [key, stripUnsupported(value)]),
    );
  }
  return node;
}

/** JSON Schema that Gemini enforces on the response (the Zod schema validates it again). */
function jsonSchema(schema: z.ZodType): unknown {
  return stripUnsupported(z.toJSONSchema(schema, { io: "input" }));
}

/** Runs a structured-output request and validates the JSON against the Zod schema. */
async function generateJson<T extends z.ZodType>(
  schema: T,
  contents: Content[],
  cfg: Omit<GenerateContentConfig, "responseMimeType" | "responseJsonSchema">,
): Promise<z.infer<T>> {
  try {
    const response = await ai.models.generateContent({
      model: config.GEMINI_MODEL,
      contents,
      config: {
        ...cfg,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema(schema),
      },
    });

    if (response.promptFeedback?.blockReason) {
      throw new AiError("L'AI non ha potuto elaborare questa richiesta.", 422);
    }
    const finish = response.candidates?.[0]?.finishReason;
    if (finish === FinishReason.MAX_TOKENS) {
      throw new AiError("Risposta AI incompleta, riprova.", 502);
    }
    if (finish && finish !== FinishReason.STOP) {
      throw new AiError("L'AI non ha potuto elaborare questa richiesta.", 422);
    }

    const parsed = schema.safeParse(JSON.parse(response.text ?? ""));
    if (!parsed.success) throw new AiError("Risposta AI non valida, riprova.", 502);
    return parsed.data;
  } catch (err) {
    if (err instanceof SyntaxError) throw new AiError("Risposta AI non valida, riprova.", 502);
    throw toAiError(err);
  }
}

// ---------------------------------------------------------------------------
// 1. Vision: tag a garment from a photo
// ---------------------------------------------------------------------------

/**
 * Same shape as GarmentAttributesSchema, but tolerant: an out-of-vocabulary value
 * falls back to a sensible default instead of failing the whole upload.
 */
const AiGarmentSchema = GarmentAttributesSchema.extend({
  category: z.enum(CATEGORIES).catch("top"),
  seasons: z.array(z.enum(SEASONS)).catch([...SEASONS]),
  formality: z.enum(FORMALITY).catch("casual"),
  warmth: z.number().catch(3).describe("Da 1 (molto leggero) a 5 (molto caldo)"),
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
  const result = await generateJson(
    TaggingSchema,
    [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: mediaType, data: image.toString("base64") } },
          { text: "Analizza questo capo e restituisci i suoi attributi." },
        ],
      },
    ],
    {
      systemInstruction: TAGGING_SYSTEM,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      maxOutputTokens: 8192,
    },
  );

  if (!result.is_clothing) {
    throw new AiError(
      result.rejection_reason || "Nella foto non sembra esserci un capo d'abbigliamento.",
      422,
    );
  }
  return { ...result.garment, warmth: clampWarmth(result.garment.warmth) };
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
  // Stable prefix first (instructions + wardrobe) so Gemini's implicit caching can reuse it;
  // the volatile context (date, weather) goes into the latest user turn.
  const systemInstruction = `${STYLIST_SYSTEM}\n\nGuardaroba dell'utente (${req.wardrobe.length} capi):\n${serializeWardrobe(req.wardrobe)}`;

  const contents: Content[] = [
    ...req.history.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    })),
    {
      role: "user",
      parts: [
        { text: `<contesto>\n${describeContext(req.weather, req.timezone)}\n</contesto>\n\n${req.message}` },
      ],
    },
  ];

  return generateJson(OutfitResponseSchema, contents, {
    systemInstruction,
    thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    maxOutputTokens: 16384,
  });
}
