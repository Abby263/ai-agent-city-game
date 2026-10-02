// The cities you can play. Each is the same kind of neighbourhood (homes, a market, a station, a river) with its
// own people, places, stories, calendar, climate and look. The simulation asks the active city for anything local;
// which city is active is chosen once, before a world loads, and remembered in this browser.

export type CityId = "nakameguro" | "lucknow";

export type Climate = {
  /** Monthly mean high and low (°C) and the share of days with rain, January first. */
  months: Array<{ high: number; low: number; rain: number }>;
  /** The rainy season, [month, day] to [month, day], and the chance of rain on a day inside it (else the month's own). */
  rains: { from: [number, number]; to: [number, number]; chance?: number };
  typhoons: boolean;
  snow: boolean;
  /** Chance per day of a strong and of a small earthquake. */
  quakes: [strong: number, small: number];
  fog: { months: number[]; chance: number };
  heatwave: { from: [number, number]; to: [number, number]; high: number };
};

export type Season = "spring" | "summer" | "autumn" | "winter";

export type City = {
  id: CityId;
  name: string;
  /** "Meguro City, Tokyo": where the neighbourhood is, for captions. */
  region: string;
  /** The city whose clock and sky it follows. */
  metro: string;
  country: string;
  tagline: string;
  /** One line for the city picker. */
  blurb: string;
  emoji: string;
  utcOffsetMinutes: number;
  coords: { lat: number; lon: number };
  /** Captions over the opening flight from space, as [seconds, text]. */
  flight: Array<[number, string]>;
  timezone: string;
  currency: string;
  /** What each place is called here, by location id. */
  places: Record<string, string>;
  /** The line in every resident's character prompt that says where they are from. */
  belonging: (nationality: string) => string;
  /** How people here talk, for the scene writer. */
  speech: string;
  /** Preferred device voice languages, best first. */
  voices: RegExp;
  climate: Climate;
  season: (month: number) => Season;
  seasonIcon: Record<Season, string>;
  holiday: (date: Date) => string | null;
  schoolBreak: (month: number, day: number) => string | null;
  /** Phrases written for Nakameguro and what they are here, longest first. */
  words: Array<[RegExp, string]>;
};

/** Nth Monday of a month, for "happy Monday" holidays. */
function nthMonday(year: number, month: number, n: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (7 - ((first.getUTCDay() + 6) % 7)) % 7;
  return 1 + shift + (n - 1) * 7;
}

const NAKAMEGURO: City = {
  id: "nakameguro", name: "Nakameguro", region: "Meguro City, Tokyo", metro: "Tokyo", country: "Japan", tagline: "STORIES OF NAKAMEGURO",
  blurb: "A canal-side Tokyo neighbourhood of cafes, a shrine and the train line overhead.", emoji: "🗾",
  utcOffsetMinutes: 540, coords: { lat: 35.644, lon: 139.699 }, timezone: "Asia/Tokyo", currency: "$",
  flight: [[0, ""], [2.6, "Japan"], [4, "Tokyo"], [5.1, "Nakameguro, Meguro City"]],
  places: {},
  belonging: (nationality) => `${nationality} resident of Tokyo, Japan. Be an individual, not a cultural stereotype. Respond in the player's language.`,
  speech: "",
  voices: /^en(?:-|_|$)/i,
  climate: {
    months: [
      { high: 10, low: 1, rain: 0.17 }, { high: 11, low: 2, rain: 0.2 }, { high: 14, low: 5, rain: 0.33 },
      { high: 19, low: 10, rain: 0.33 }, { high: 24, low: 15, rain: 0.33 }, { high: 26, low: 19, rain: 0.42 },
      { high: 30, low: 23, rain: 0.37 }, { high: 31, low: 24, rain: 0.27 }, { high: 27, low: 21, rain: 0.37 },
      { high: 22, low: 15, rain: 0.33 }, { high: 17, low: 9, rain: 0.27 }, { high: 12, low: 4, rain: 0.17 },
    ],
    rains: { from: [6, 7], to: [7, 19], chance: 0.55 }, typhoons: true, snow: true, quakes: [0.004, 0.035],
    fog: { months: [3, 4, 5, 10, 11], chance: 0.12 }, heatwave: { from: [7, 5], to: [9, 5], high: 32 },
  },
  season: (month) => (month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter"),
  seasonIcon: { spring: "🌸", summer: "🎐", autumn: "🍁", winter: "⛄" },
  holiday(date) {
    const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
    const fixed: Record<string, string> = {
      "1-1": "New Year's Day", "1-2": "New Year holiday", "1-3": "New Year holiday", "2-11": "National Foundation Day",
      "2-23": "Emperor's Birthday", "3-20": "Vernal Equinox Day", "4-29": "Showa Day", "5-3": "Constitution Day",
      "5-4": "Greenery Day", "5-5": "Children's Day", "8-11": "Mountain Day", "9-23": "Autumnal Equinox Day",
      "11-3": "Culture Day", "11-23": "Labour Thanksgiving Day",
    };
    if (fixed[`${m}-${d}`]) return fixed[`${m}-${d}`];
    if (m === 1 && d === nthMonday(y, 1, 2)) return "Coming of Age Day";
    if (m === 7 && d === nthMonday(y, 7, 3)) return "Marine Day";
    if (m === 9 && d === nthMonday(y, 9, 3)) return "Respect for the Aged Day";
    if (m === 10 && d === nthMonday(y, 10, 2)) return "Sports Day";
    return null;
  },
  schoolBreak(month, day) {
    if ((month === 7 && day >= 20) || month === 8) return "Summer break";
    if ((month === 12 && day >= 25) || (month === 1 && day <= 7)) return "Winter break";
    if ((month === 3 && day >= 25) || (month === 4 && day <= 5)) return "Spring break";
    return null;
  },
  words: [],
};

// Festivals that follow the moon, by date (approximate where a sighting decides the day).
const LUCKNOW_FESTIVALS: Record<string, string> = {
  "2026-3-4": "Holi", "2026-3-21": "Eid al-Fitr", "2026-3-26": "Ram Navami", "2026-5-27": "Eid al-Adha", "2026-6-26": "Muharram",
  "2026-8-28": "Raksha Bandhan", "2026-9-4": "Janmashtami", "2026-10-20": "Dussehra", "2026-11-8": "Diwali", "2026-11-24": "Guru Nanak Jayanti",
  "2027-3-10": "Eid al-Fitr", "2027-3-22": "Holi", "2027-4-15": "Ram Navami", "2027-5-17": "Eid al-Adha", "2027-6-16": "Muharram",
  "2027-8-17": "Raksha Bandhan", "2027-8-25": "Janmashtami", "2027-10-9": "Dussehra", "2027-10-29": "Diwali", "2027-11-14": "Guru Nanak Jayanti",
};

const LUCKNOW: City = {
  id: "lucknow", name: "Lucknow", region: "Hazratganj and Chowk, Uttar Pradesh", metro: "Lucknow", country: "India", tagline: "STORIES OF LUCKNOW",
  blurb: "The city of nawabs: old Chowk's lanes and kababs on one bank of the Gomti, Hazratganj's arcades on the other.", emoji: "🕌",
  utcOffsetMinutes: 330, coords: { lat: 26.8467, lon: 80.9462 }, timezone: "Asia/Kolkata", currency: "₹",
  flight: [[0, ""], [2.6, "India"], [4, "Uttar Pradesh"], [5.1, "Lucknow, on the Gomti"]],
  places: {
    loc_homes: "Chowk Mohalla", loc_hospital: "KGMU Hospital", loc_school: "Gomti Public School", loc_bank: "Aminabad Bank",
    loc_market: "Aminabad Bazaar", loc_restaurant: "Nawab Kabab House", loc_pharmacy: "Chowk Medical Store", loc_farm: "Dussehri Mango Orchard",
    loc_police: "Chowk Kotwali", loc_city_hall: "Nagar Nigam Office", loc_lab: "Drug Research Institute", loc_library: "Amir-ud-Daula Library",
    loc_power: "Power Substation", loc_park: "Begum Hazrat Mahal Park", loc_bus_stop: "Chowk Tempo Stand", loc_gym: "Gomti Riverfront Gym",
    loc_apartments: "Hazratganj Apartments", loc_office: "Gomti IT Tower", loc_mall: "Hazratganj Arcade", loc_station: "Charbagh Station",
    loc_konbini: "Sharmaji Chai & Kirana", loc_shrine: "Bara Imambara", loc_clinic: "Hazratganj Clinic",
  },
  belonging: (nationality) => `${nationality} resident of Lucknow, India. Be an individual, not a cultural stereotype. Respond in the player's language.`,
  speech: "They are in Lucknow, a city proud of its tehzeeb (courtesy). They speak English here, with the odd natural Hindi or Urdu word "
    + "(ji, bhai, beta, arre, accha, aap, yaar) the way Lucknowites do, never whole sentences of it. Elders are addressed with respect.",
  voices: /^(en-IN|hi-IN|en(?:-|_|$))/i,
  climate: {
    months: [
      { high: 22, low: 8, rain: 0.06 }, { high: 26, low: 11, rain: 0.07 }, { high: 32, low: 15, rain: 0.05 },
      { high: 38, low: 21, rain: 0.04 }, { high: 40, low: 25, rain: 0.08 }, { high: 38, low: 27, rain: 0.22 },
      { high: 34, low: 26, rain: 0.5 }, { high: 33, low: 26, rain: 0.5 }, { high: 33, low: 24, rain: 0.33 },
      { high: 33, low: 19, rain: 0.08 }, { high: 29, low: 13, rain: 0.03 }, { high: 24, low: 9, rain: 0.04 },
    ],
    rains: { from: [6, 20], to: [9, 25] }, typhoons: false, snow: false, quakes: [0.0004, 0.004],
    fog: { months: [12, 1], chance: 0.45 }, heatwave: { from: [4, 15], to: [6, 25], high: 41 },
  },
  season: (month) => (month === 2 || month === 3 ? "spring" : month >= 4 && month <= 9 ? "summer" : month >= 10 && month <= 11 ? "autumn" : "winter"),
  seasonIcon: { spring: "🌼", summer: "☀️", autumn: "🪁", winter: "🌫️" },
  holiday(date) {
    const y = date.getUTCFullYear(), m = date.getUTCMonth() + 1, d = date.getUTCDate();
    const fixed: Record<string, string> = { "1-26": "Republic Day", "4-14": "Ambedkar Jayanti", "8-15": "Independence Day", "10-2": "Gandhi Jayanti", "12-25": "Christmas" };
    return fixed[`${m}-${d}`] ?? LUCKNOW_FESTIVALS[`${y}-${m}-${d}`] ?? null;
  },
  schoolBreak(month, day) {
    if ((month === 5 && day >= 20) || month === 6) return "Summer vacation";
    if ((month === 12 && day >= 31) || (month === 1 && day <= 14)) return "Winter break";
    return null;
  },
  words: [
    [/Nakameguro neighbourhood association(?: \(chōnaikai\))?/g, "Chowk mohalla committee"],
    [/Meguro Community Garden/g, "the Dussehri Mango Orchard"], [/Meguro Science Lab/g, "Drug Research Institute"],
    [/Sunny Side Cafe/g, "Nawab Kabab House"], [/Hikawa Shrine/g, "Bara Imambara"], [/Kyosai Hospital/g, "KGMU Hospital"],
    [/HappyMart(?: 24)?/g, "Sharmaji's"], [/Kokashita Arcade/g, "Hazratganj Arcade"], [/Saigoyama Park/g, "Begum Hazrat Mahal Park"],
    [/Morning prayer at/g, "A quiet morning visit to"], [/Baseball practice/g, "Cricket practice"], [/Drawing manga/g, "Writing verses"],
    [/Piano practice at/g, "Harmonium practice at"], [/Playing football in the park/g, "Flying kites in the park"],
    [/\(shindo (\d)\)/g, "(intensity $1)"], [/Shindo (\d)/g, "Intensity $1"],
    [/trains and buses/g, "the metro and tempos"], [/the bus or train/g, "a tempo or the metro"],
    [/Nakameguro/g, "Lucknow"], [/Tokyo/g, "Lucknow"],
  ],
};

export const CITIES: Record<CityId, City> = { nakameguro: NAKAMEGURO, lucknow: LUCKNOW };
export const CITY_LIST: City[] = [NAKAMEGURO, LUCKNOW];
const KEY = "agentcity.city";
const isCity = (value: unknown): value is CityId => typeof value === "string" && value in CITIES;

function remembered(): CityId | null {
  if (typeof window === "undefined") return null;
  try {
    const asked = typeof window.location?.search === "string" ? new URLSearchParams(window.location.search).get("city") : null;
    if (isCity(asked)) return asked;
    const saved = window.localStorage?.getItem(KEY);
    return isCity(saved) ? saved : null;
  } catch {
    return null;
  }
}

let active: CityId = remembered() ?? "nakameguro";
const listeners = new Set<(city: City) => void>();

export const activeCity = () => CITIES[active];
/** True once the player has picked a city in this browser (or a link named one). */
export const cityChosen = () => remembered() !== null;

/** Modules holding a city's data (storylines, the cast) re-point themselves when the city changes. */
export function onCityChange(listener: (city: City) => void) {
  listeners.add(listener);
  listener(CITIES[active]);
}

/** Switches city for everything loaded after this call. In the browser, follow it with a reload. */
export function setActiveCity(id: CityId, remember = false) {
  active = id;
  if (remember) {
    try { window.localStorage.setItem(KEY, id); } catch { /* chosen for this visit only */ }
  }
  listeners.forEach((listener) => listener(CITIES[id]));
}

/** Text written with Nakameguro's names, as it reads in the active city. */
export function cityText(text: string) {
  const city = CITIES[active];
  if (!city.words.length || !text) return text;
  let out = text;
  for (const [from, to] of city.words) out = out.replace(from, to);
  return out;
}

/** Where saved worlds live: each city keeps its own, so switching never overwrites the other. */
export const storagePrefix = (version: string) => (active === "nakameguro" ? `agentcity.${version}.` : `agentcity.${version}.${active}.`);
