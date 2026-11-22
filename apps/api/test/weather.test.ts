import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getWeather } from "../src/services/weather.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(body: unknown, init: { ok?: boolean } = {}) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return { ok: init.ok ?? true, json: async () => body } as Response;
  }) as typeof fetch;
  return calls;
}

const openMeteo = (code: number, precipitation: number | null = 40) => ({
  current: { temperature_2m: 17.6, apparent_temperature: 16.4, weather_code: code, wind_speed_10m: 11.2 },
  daily: { temperature_2m_max: [21.4], temperature_2m_min: [9.5], precipitation_probability_max: [precipitation] },
});

test("converte la risposta Open-Meteo in un riepilogo arrotondato", async () => {
  const calls = mockFetch(openMeteo(61));
  const w = await getWeather(45.46421, 9.19);
  assert.deepEqual(w, {
    description: "pioggia leggera",
    temperatureC: 18,
    feelsLikeC: 16,
    minC: 10,
    maxC: 21,
    precipitationProbability: 40,
    windKmh: 11,
  });
  const url = new URL(calls[0]!);
  assert.equal(url.hostname, "api.open-meteo.com");
  assert.equal(url.searchParams.get("latitude"), "45.464", "coordinate ridotte a 3 decimali");
  assert.equal(url.searchParams.get("forecast_days"), "1");
});

test("codice meteo sconosciuto = 'variabile', probabilità mancante = 0", async () => {
  mockFetch(openMeteo(42, null));
  const w = await getWeather(0, 0);
  assert.equal(w?.description, "variabile");
  assert.equal(w?.precipitationProbability, 0);
});

test("se Open-Meteo risponde con errore restituisce null", async () => {
  mockFetch({}, { ok: false });
  assert.equal(await getWeather(0, 0), null);
});

test("se la rete fallisce restituisce null senza lanciare eccezioni", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  assert.equal(await getWeather(0, 0), null);
});
