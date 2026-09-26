import { weekdayIndex } from "./routine";
import type { CityState } from "./types";

// Spots a plan agreed in a chat ("Friday at seven at the food court") so it can become a real meet-up.

const dayWords = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, noon: 12 };
const placeWords: Array<[RegExp, string]> = [
  [/food court|mall|arcade|kokashita/, "loc_mall"], [/ramen|cafe|café|sunny side|restaurant|dinner/, "loc_restaurant"],
  [/park|saigoyama/, "loc_park"], [/station/, "loc_station"], [/shrine|hikawa/, "loc_shrine"], [/library/, "loc_library"],
  [/gym/, "loc_gym"], [/school/, "loc_school"], [/konbini|happymart/, "loc_konbini"], [/market|ginza/, "loc_market"],
];

export type ParsedPlan = { day: number; minute: number; location_id: string; label: string };

export function parsePlan(text: string, city: CityState): ParsedPlan | null {
  const t = text.toLowerCase();
  // The most recently mentioned day wins: "what brings you by today?" early on shouldn't beat "Friday then!".
  const mentions: Array<{ at: number; day: number }> = [];
  for (const match of t.matchAll(/\b(today|tonight|this evening|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)) {
    const word = match[1];
    const named = dayWords.indexOf(word);
    const offset = word === "tomorrow" ? 1 : named >= 0 ? (named - weekdayIndex(city.clock.day) + 7) % 7 || 7 : 0;
    mentions.push({ at: match.index ?? 0, day: city.clock.day + offset });
  }
  const day: number | null = mentions.length ? mentions[mentions.length - 1].day : null;
  const clock = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/) ?? null;
  const worded = t.match(/\b(?:at|around|by)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|noon)\b/)
    ?? t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:at|o'clock|pm|tonight|sharp)\b/);
  let hour: number | null = null, minutes = 0;
  if (clock && (clock[3] || clock[2] || /\b(at|around|by)\s+\d/.test(t))) {
    hour = Number(clock[1]);
    minutes = Number(clock[2] ?? 0);
    if (clock[3] === "pm" && hour < 12) hour += 12;
  } else if (worded) hour = numberWords[worded[1]];
  if (hour !== null && hour < 12 && !/\bam\b|morning/.test(t) && hour >= 1 && hour <= 9) hour += 12; // "seven" after work means 19:00
  if (day === null || hour === null || hour > 23) return null;
  const minute = Math.min(1439, hour * 60 + Math.min(59, minutes));
  if (day === city.clock.day && minute <= city.clock.minute_of_day + 30) return null;
  const location_id = placeWords.find(([pattern]) => pattern.test(t))?.[1] ?? "loc_restaurant";
  const place = city.locations.find((l) => l.location_id === location_id)?.name ?? "town";
  const when = day === city.clock.day ? "today" : day === city.clock.day + 1 ? "tomorrow" : dayWords[weekdayIndex(day)].replace(/^./, (c) => c.toUpperCase());
  return { day, minute, location_id, label: `${when} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")} at ${place}` };
}
