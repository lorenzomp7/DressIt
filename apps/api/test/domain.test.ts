import assert from "node:assert/strict";
import { test } from "node:test";
import { clampWarmth, GarmentAttributesSchema, ItemUpdateSchema } from "../src/domain.js";

test("clampWarmth arrotonda e limita il calore a 1-5", () => {
  assert.equal(clampWarmth(0), 1);
  assert.equal(clampWarmth(-3), 1);
  assert.equal(clampWarmth(2.4), 2);
  assert.equal(clampWarmth(2.5), 3);
  assert.equal(clampWarmth(5), 5);
  assert.equal(clampWarmth(9), 5);
});

test("ItemUpdateSchema accetta modifiche parziali", () => {
  assert.deepEqual(ItemUpdateSchema.parse({ name: "Giacca" }), { name: "Giacca" });
  assert.deepEqual(ItemUpdateSchema.parse({}), {});
});

test("ItemUpdateSchema rifiuta calore fuori scala e categorie sconosciute", () => {
  assert.equal(ItemUpdateSchema.safeParse({ warmth: 6 }).success, false);
  assert.equal(ItemUpdateSchema.safeParse({ warmth: 0 }).success, false);
  assert.equal(ItemUpdateSchema.safeParse({ warmth: 2.5 }).success, false);
  assert.equal(ItemUpdateSchema.safeParse({ category: "cappello" }).success, false);
  assert.equal(ItemUpdateSchema.safeParse({ seasons: ["estate"] }).success, false);
});

test("GarmentAttributesSchema accetta un capo completo come lo restituisce l'AI", () => {
  const garment = {
    name: "Camicia azzurra di lino",
    category: "top",
    subcategory: "camicia",
    colors: ["azzurro"],
    pattern: "tinta unita",
    material: "lino",
    seasons: ["spring", "summer"],
    formality: "smart_casual",
    warmth: 2,
    tags: ["estivo", "minimal"],
    description: "Camicia leggera da abbinare a chino beige.",
  };
  assert.deepEqual(GarmentAttributesSchema.parse(garment), garment);
});
