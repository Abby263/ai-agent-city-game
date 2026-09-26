import { calendarDay, type CalendarDay } from "./calendar";
import { roll } from "./life";

// Nakameguro's climate follows Tokyo: monthly mean high/low (°C) and the share of days with rain.
const climate = [
  { high: 10, low: 1, rain: 0.17 }, { high: 11, low: 2, rain: 0.2 }, { high: 14, low: 5, rain: 0.33 },
  { high: 19, low: 10, rain: 0.33 }, { high: 24, low: 15, rain: 0.33 }, { high: 26, low: 19, rain: 0.42 },
  { high: 30, low: 23, rain: 0.37 }, { high: 31, low: 24, rain: 0.27 }, { high: 27, low: 21, rain: 0.37 },
  { high: 22, low: 15, rain: 0.33 }, { high: 17, low: 9, rain: 0.27 }, { high: 12, low: 4, rain: 0.17 },
];

export type Condition = "clear" | "partly_cloudy" | "cloudy" | "fog" | "rain" | "heavy_rain" | "thunderstorm" | "snow" | "typhoon";
export type AlertKind = "typhoon" | "heavy_rain" | "heatwave" | "snow" | "earthquake";

export type DayWeather = {
  condition: Condition;
  high: number;
  low: number;
  heatwave: boolean;
  morningFog: boolean;
  afternoonThunder: boolean;
  quake: { minute: number; intensity: number } | null;
  rainySeason: boolean;
};

export type WeatherOverride = {
  condition: Condition | "heatwave" | "earthquake";
  day: number;
  from: number;
  until: number;
  temp_c?: number;
  source?: "player" | "tokyo";
};

export type WeatherNow = {
  condition: Condition;
  icon: string;
  label: string;
  temp_c: number;
  high: number;
  low: number;
  /** 0-1 intensity of rain or snow. */
  precipitation: number;
  clouds: number;
  wind: number;
  lightning: boolean;
  fog: number;
  heatwave: boolean;
  alert: { kind: AlertKind; text: string } | null;
  quake: { intensity: number } | null;
  season: CalendarDay["season"];
  source: "climate" | "player" | "tokyo";
};

function monthly(c: CalendarDay) {
  // Blend with the neighbouring month so temperatures change smoothly through the year.
  const i = c.month - 1, next = c.dayOfMonth > 15 ? (i + 1) % 12 : (i + 11) % 12;
  const t = Math.abs(c.dayOfMonth - 15) / 30;
  const a = climate[i], b = climate[next];
  return { high: a.high + (b.high - a.high) * t, low: a.low + (b.low - a.low) * t, rain: a.rain };
}

const inRange = (c: CalendarDay, from: [number, number], to: [number, number]) => {
  const v = c.month * 100 + c.dayOfMonth;
  return v >= from[0] * 100 + from[1] && v <= to[0] * 100 + to[1];
};

export function dayWeather(start: string, day: number): DayWeather {
  const c = calendarDay(start, day);
  const key = c.date.toISOString().slice(0, 10);
  const r = (label: string) => roll("weather", key, label);
  const base = monthly(c);
  const rainySeason = inRange(c, [6, 7], [7, 19]);
  const typhoonSeason = inRange(c, [8, 1], [10, 20]);
  const typhoonStart = (d: number) => typhoonSeason && roll("weather", calendarDay(start, d).date.toISOString().slice(0, 10), "typhoon") < 0.012;
  const typhoon = typhoonStart(day) || typhoonStart(day - 1);
  const anomaly = (r("anomaly") - 0.5) * 6;
  let high = base.high + anomaly, low = base.low + anomaly * 0.6;
  const wet = r("rain") < (rainySeason ? 0.55 : base.rain);
  let condition: Condition;
  if (typhoon) condition = "typhoon";
  else if (wet) {
    const snowy = c.season === "winter" && low <= 2 && r("snow") < 0.55;
    condition = snowy ? "snow" : r("heavy") < (rainySeason ? 0.1 : 0.14) ? "heavy_rain" : "rain";
  } else {
    const sky = r("sky");
    condition = sky < 0.45 ? "clear" : sky < 0.8 ? "partly_cloudy" : "cloudy";
  }
  if (condition === "rain" || condition === "heavy_rain" || condition === "typhoon") high -= 3;
  if (condition === "snow") { high = Math.min(high, 4); low = Math.min(low, -1); }
  const heatwave = inRange(c, [7, 5], [9, 5]) && !wet && high >= 32;
  const afternoonThunder = ["rain", "heavy_rain"].includes(condition) && c.month >= 6 && c.month <= 9 && r("thunder") < 0.45;
  const morningFog = ["clear", "partly_cloudy"].includes(condition) && [3, 4, 5, 10, 11].includes(c.month) && r("fog") < 0.12;
  const q = r("quake");
  const quake = q < 0.004 ? { minute: Math.floor(r("quake-time") * 1440), intensity: 5 } : q < 0.035 ? { minute: Math.floor(r("quake-time") * 1440), intensity: 1 + Math.floor(r("quake-size") * 3) } : null;
  return { condition, high: Math.round(high * 10) / 10, low: Math.round(low * 10) / 10, heatwave, morningFog, afternoonThunder, quake, rainySeason };
}

/** Coldest just before dawn, warmest mid-afternoon. */
export function temperatureAt(high: number, low: number, minute: number) {
  const h = minute / 60;
  const f = h >= 5 && h < 14.5 ? 0.5 - 0.5 * Math.cos((Math.PI * (h - 5)) / 9.5) : 0.5 + 0.5 * Math.cos((Math.PI * ((h < 5 ? h + 24 : h) - 14.5)) / 14.5);
  return low + (high - low) * f;
}

const looks: Record<Condition, { icon: string; label: string; precipitation: number; clouds: number; wind: number }> = {
  clear: { icon: "☀️", label: "Clear", precipitation: 0, clouds: 0.1, wind: 0.1 },
  partly_cloudy: { icon: "⛅", label: "Partly cloudy", precipitation: 0, clouds: 0.45, wind: 0.15 },
  cloudy: { icon: "☁️", label: "Cloudy", precipitation: 0, clouds: 0.85, wind: 0.2 },
  fog: { icon: "🌫️", label: "Foggy", precipitation: 0, clouds: 0.7, wind: 0.05 },
  rain: { icon: "🌧️", label: "Rain", precipitation: 0.45, clouds: 0.95, wind: 0.25 },
  heavy_rain: { icon: "🌧️", label: "Heavy rain", precipitation: 0.85, clouds: 1, wind: 0.45 },
  thunderstorm: { icon: "⛈️", label: "Thunderstorm", precipitation: 0.75, clouds: 1, wind: 0.5 },
  snow: { icon: "🌨️", label: "Snow", precipitation: 0.5, clouds: 0.95, wind: 0.2 },
  typhoon: { icon: "🌀", label: "Typhoon", precipitation: 1, clouds: 1, wind: 1 },
};

export function weatherAt(start: string, day: number, minute: number, override?: WeatherOverride | null): WeatherNow {
  const c = calendarDay(start, day);
  const w = dayWeather(start, day);
  let condition = w.condition;
  if (w.morningFog && minute >= 300 && minute < 570) condition = "fog";
  if (w.afternoonThunder) condition = minute >= 840 && minute < 1140 ? "thunderstorm" : minute < 840 ? "cloudy" : condition;
  let heatwave = w.heatwave;
  let quake = w.quake && minute >= w.quake.minute && minute < w.quake.minute + 15 ? { intensity: w.quake.intensity } : null;
  let temp = temperatureAt(w.high, w.low, minute);
  let source: WeatherNow["source"] = "climate";
  const active = override && override.day === day && minute >= override.from && minute < override.until ? override : null;
  if (active) {
    source = active.source ?? "player";
    if (active.condition === "earthquake") quake = { intensity: 5 };
    else if (active.condition === "heatwave") { heatwave = true; condition = "clear"; temp = Math.max(temp, 35); }
    else condition = active.condition;
    if (active.temp_c !== undefined) temp = active.temp_c;
    if (condition === "snow") temp = Math.min(temp, 1);
  }
  const look = looks[condition];
  const night = minute < 330 || minute >= 1110;
  const alert: WeatherNow["alert"] = quake && quake.intensity >= 4 ? { kind: "earthquake", text: `Earthquake! Shindo ${quake.intensity}. Drop, cover, hold on, then walk to the evacuation area.` }
    : quake ? { kind: "earthquake", text: `A small earthquake (shindo ${quake.intensity}) shook Nakameguro. Everyone is fine.` }
    : condition === "typhoon" ? { kind: "typhoon", text: "Typhoon warning: stay indoors. School and most shops are closed; trains and buses are suspended." }
    : condition === "heavy_rain" ? { kind: "heavy_rain", text: "Heavy rain warning: watch out for flooding near the river." }
    : heatwave ? { kind: "heatwave", text: "Heatstroke alert: drink water, rest in the shade and check on older neighbours." }
    : condition === "snow" ? { kind: "snow", text: "Snow in Nakameguro: pavements are slippery and trains may run late." }
    : null;
  return {
    condition, icon: condition === "clear" && night ? "🌙" : look.icon, label: heatwave && condition === "clear" ? "Very hot" : look.label,
    temp_c: Math.round(temp * 10) / 10, high: w.high, low: w.low, precipitation: look.precipitation, clouds: look.clouds, wind: look.wind,
    lightning: condition === "thunderstorm" || condition === "typhoon", fog: condition === "fog" ? 1 : condition === "heavy_rain" || condition === "typhoon" ? 0.6 : condition === "snow" ? 0.4 : 0,
    heatwave, alert, quake, season: c.season, source,
  };
}

export const isWet = (w: Pick<WeatherNow, "condition">) => ["rain", "heavy_rain", "thunderstorm", "typhoon"].includes(w.condition);
export const isSevere = (w: Pick<WeatherNow, "condition">) => w.condition === "typhoon";

/** Maps a WMO weather code (as used by Open-Meteo) to Nakameguro's conditions. */
export function conditionFromWmo(code: number, windKmh = 0): Condition {
  if (windKmh >= 60 && code >= 61) return "typhoon";
  if (code === 0) return "clear";
  if (code <= 2) return "partly_cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 95) return "thunderstorm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code === 65 || code === 67 || code === 82) return "heavy_rain";
  if (code >= 51) return "rain";
  return "cloudy";
}
