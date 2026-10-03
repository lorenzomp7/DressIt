/** Current weather via Open-Meteo (free, no API key). */
export interface WeatherSummary {
  description: string;
  temperatureC: number;
  feelsLikeC: number;
  minC: number;
  maxC: number;
  precipitationProbability: number;
  windKmh: number;
}

const WMO_CODES: Record<number, string> = {
  0: "sereno",
  1: "prevalentemente sereno",
  2: "parzialmente nuvoloso",
  3: "coperto",
  45: "nebbia",
  48: "nebbia con brina",
  51: "pioviggine leggera",
  53: "pioviggine",
  55: "pioviggine intensa",
  61: "pioggia leggera",
  63: "pioggia",
  65: "pioggia forte",
  71: "neve leggera",
  73: "neve",
  75: "neve forte",
  80: "rovesci leggeri",
  81: "rovesci",
  82: "rovesci violenti",
  95: "temporale",
  96: "temporale con grandine",
  99: "temporale forte con grandine",
};

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
}

export async function getWeather(lat: number, lon: number): Promise<WeatherSummary | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "1",
  }).toString();

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenMeteoResponse;
    return {
      description: WMO_CODES[data.current.weather_code] ?? "variabile",
      temperatureC: Math.round(data.current.temperature_2m),
      feelsLikeC: Math.round(data.current.apparent_temperature),
      minC: Math.round(data.daily.temperature_2m_min[0] ?? data.current.temperature_2m),
      maxC: Math.round(data.daily.temperature_2m_max[0] ?? data.current.temperature_2m),
      precipitationProbability: data.daily.precipitation_probability_max[0] ?? 0,
      windKmh: Math.round(data.current.wind_speed_10m),
    };
  } catch {
    // Weather is a nice-to-have: never fail the outfit request because of it.
    return null;
  }
}
