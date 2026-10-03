import { z } from "zod";

export const CATEGORIES = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
  "bag",
] as const;
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const FORMALITY = ["sport", "casual", "smart_casual", "business", "formal"] as const;

/** Attributes the AI extracts from a photo and the user can later edit. */
export const GarmentAttributesSchema = z.object({
  name: z.string().describe("Nome breve in italiano, es. 'Camicia azzurra di lino'"),
  category: z.enum(CATEGORIES),
  subcategory: z.string().describe("es. camicia, jeans, sneakers, blazer"),
  colors: z.array(z.string()).describe("Colori principali in italiano, dal dominante"),
  pattern: z.string().describe("es. tinta unita, righe, quadri, floreale"),
  material: z.string().describe("Materiale stimato, es. lino, denim, lana"),
  seasons: z.array(z.enum(SEASONS)),
  formality: z.enum(FORMALITY),
  // Range is enforced in code (clampWarmth): structured outputs ignore min/max.
  warmth: z.number().int().describe("Da 1 (molto leggero) a 5 (molto caldo)"),
  tags: z.array(z.string()).describe("3-6 parole chiave di stile, es. minimal, estivo"),
  description: z.string().describe("Una frase che descrive il capo e come abbinarlo"),
});
export type GarmentAttributes = z.infer<typeof GarmentAttributesSchema>;

export function clampWarmth(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

export interface Item extends GarmentAttributes {
  id: string;
  userId: string;
  imageUrl: string;
  imageKey: string;
  lastWornAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields a user may edit by hand after AI tagging. */
export const ItemUpdateSchema = GarmentAttributesSchema.partial().extend({
  warmth: z.number().int().min(1).max(5).optional(),
});
export type ItemUpdate = z.infer<typeof ItemUpdateSchema>;
