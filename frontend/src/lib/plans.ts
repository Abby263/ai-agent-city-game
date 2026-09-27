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
  const clock = [...t.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g)]
    .find((match) => match[3] || match[2] || /\b(at|around|by)\s+$/.test(t.slice(0, match.index))) ?? null;
  const hours = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
  // "half past six", "quarter to eight"
  const around = t.match(new RegExp(`\\b(half|quarter) (past|to) (${hours})\\b`));
  // "at six", "at six-thirty", "seven fifteen tonight"
  const worded = t.match(new RegExp(`\\b(?:at|around|by)\\s+(${hours}|noon)(?:[\\s-](fifteen|thirty|forty[\\s-]five))?\\b`))
    ?? t.match(new RegExp(`\\b(${hours})(?:[\\s-](fifteen|thirty|forty[\\s-]five))?\\s+(?:at|o'clock|pm|tonight|sharp)\\b`));
  let hour: number | null = null, minutes = 0;
  if (clock) {
    hour = Number(clock[1]);
    minutes = Number(clock[2] ?? 0);
    if (minutes > 59 || hour > 23 || (clock[3] && (hour < 1 || hour > 12))) return null;
    if (clock[3]) hour = hour % 12 + (clock[3] === "pm" ? 12 : 0);
  } else if (around) {
    hour = numberWords[around[3]];
    minutes = around[1] === "half" ? 30 : around[2] === "past" ? 15 : 45;
    if (around[1] === "quarter" && around[2] === "to") hour = hour === 1 ? 12 : hour - 1;
  } else if (worded) {
    hour = numberWords[worded[1]];
    minutes = !worded[2] ? 0 : worded[2] === "fifteen" ? 15 : worded[2] === "thirty" ? 30 : 45;
  }
  // "Morning, Mateo!" is a greeting, not a time of day.
  const morning = /\bam\b|morning/.test(t.replace(/(^|[.!?]\s*)(good\s+)?morning\s*[,!.]/g, "$1"));
  if (hour !== null && hour < 12 && !clock?.[3] && !morning && hour >= 1 && hour <= 9) hour += 12; // "seven" after work means 19:00
  if (day === null || hour === null || hour > 23) return null;
  const minute = hour * 60 + minutes;
  if (day === city.clock.day && minute <= city.clock.minute_of_day + 30) return null;
  // As with days, the place mentioned last wins: "ramen... see you at the station shop" means the station.
  const lastAt = (pattern: RegExp) => Math.max(-1, ...[...t.matchAll(new RegExp(pattern.source, "g"))].map((m) => m.index ?? -1));
  const location_id = placeWords.map(([pattern, id]) => ({ id, at: lastAt(pattern) })).filter((p) => p.at >= 0).sort((a, b) => b.at - a.at)[0]?.id ?? "loc_restaurant";
  const place = city.locations.find((l) => l.location_id === location_id)?.name ?? "town";
  const when = day === city.clock.day ? "today" : day === city.clock.day + 1 ? "tomorrow" : dayWords[weekdayIndex(day)].replace(/^./, (c) => c.toUpperCase());
  return { day, minute, location_id, label: `${when} ${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")} at ${place}` };
}

const agreeing = /\b(yes|yeah|yep|sure|absolutely|definitely|sounds (good|great|like a plan)|deal|count me in|it'?s a date|see you|let'?s (do|go)|i'?ll be there|okay|ok|great|perfect|awesome)\b/i;
const refusing = /\b(can'?t|cannot|won'?t|no thanks|not (tonight|today|tomorrow)|another time|rain check|too busy|i'?m busy|maybe not)\b/i;

/**
 * A plan two residents agreed on out loud ("ramen at the station shop around six" / "See you there at six!"),
 * even when the model did not flag it: a time and place, then a yes from the other person and no refusal.
 */
export function agreedPlan(transcript: Array<{ speaker_id: string; text: string }>, city: CityState) {
  for (let i = 0; i < transcript.length; i++) {
    const soFar = transcript.slice(0, i + 1).map((l) => l.text).join(" ");
    const plan = parsePlan(soFar, city);
    if (!plan) continue;
    const proposer = transcript[i].speaker_id;
    const replies = transcript.slice(i + 1).filter((l) => l.speaker_id !== proposer);
    // The time can land in the reply itself ("Great, see you at six!").
    const answers = replies.length ? replies : transcript.slice(0, i + 1).filter((l) => l.speaker_id !== proposer).slice(-1);
    if (answers.some((l) => refusing.test(l.text)) || !answers.some((l) => agreeing.test(l.text))) continue;
    const opener = transcript.find((l) => placeWords.some(([pattern]) => pattern.test(l.text.toLowerCase())) || /\b(meet|dinner|lunch|coffee|ramen|drinks?)\b/i.test(l.text)) ?? transcript[i];
    return { ...plan, topic: planTopic(opener.text).slice(0, 200) };
  }
  return null;
}

/** "Awesome, how about we grab a coffee and map out the party?" becomes "grab a coffee and map out the party". */
export function planTopic(line: string) {
  const text = line
    .replace(/^\s*((oh|awesome|great|sure|okay|ok|yes|yeah|perfect|sounds good|absolutely|definitely|well|hey|so|and)[\s,!.—-]+)+/i, "")
    .replace(/^(how about (we|you and i)|let'?s|we could|we should|(do|would) you (want|like) to|want to|shall we|maybe we (can|could))\s+/i, "")
    .replace(/[?!.\s]+$/, "");
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : line;
}
