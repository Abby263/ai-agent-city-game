import { catchCondition, relationName, relatives, type LifeSink } from "./life";
import { bondLabel } from "./social";
import type { CitizenAgent, CityState, Emotions, Feelings, Relationship } from "./types";

// Anything the player writes becomes an "act": the game master interprets the words (who, where, how warm or hostile,
// any harm, money or relationship step) and this module applies capped, generic effects. There is no list of actions.

/** A change in how one resident feels about another, with the reason they remember. */
export type BondChange = { from: string; to: string; trust?: number; warmth?: number; familiarity?: number; feelings?: Partial<Feelings>; reason: string };
export type ActionTools = { sink: LifeSink; adjustBonds: (changes: BondChange[]) => void; bond: (from: string, to: string) => Relationship | undefined };

export type Tone = "warm" | "romantic" | "playful" | "neutral" | "tense" | "hostile";
export type Proposal = "none" | "date" | "engagement" | "marriage" | "breakup" | "move_in";

export type ActRequest = {
  kind: "action" | "situation";
  text: string;
  city_time: string;
  actor: CitizenAgent | null;
  target: CitizenAgent | null;
  people: Array<{ citizen_id: string; name: string; age: number; location: string; activity: string; relation_to_actor: string }>;
  places: Array<{ location_id: string; name: string }>;
  bond: string;
};

export type ActInterpretation = {
  allowed: boolean;
  refusal: string;
  headline: string;
  target_id: string;
  involved_ids: string[];
  location_id: string;
  tone: Tone;
  intensity: number;
  harm: number;
  money: number;
  proposal: Proposal;
  closes_location: boolean;
  reaction: string;
  target_memory: string;
};

export type AppliedAct = { headline: string; icon: string; target: CitizenAgent | null; pair: [CitizenAgent, CitizenAgent] | null; location_id: string };

export const toneIcon: Record<Tone, string> = { warm: "🤝", romantic: "💞", playful: "😜", neutral: "💬", tense: "😠", hostile: "💥" };

// How the person it is done to is moved, per step of intensity (0-3 becomes 1-4 steps).
const toneEffect: Record<Tone, { warmth: number; trust: number; affection: number; resentment: number; emotions: Partial<Emotions> }> = {
  warm: { warmth: 3, trust: 2, affection: 2, resentment: -2, emotions: { joy: 6, sadness: -3 } },
  romantic: { warmth: 2, trust: 1, affection: 4, resentment: 0, emotions: { joy: 6 } },
  playful: { warmth: 1, trust: 0, affection: 1, resentment: 0, emotions: { joy: 4 } },
  neutral: { warmth: 0, trust: 0, affection: 0, resentment: 0, emotions: {} },
  tense: { warmth: -3, trust: -2, affection: 0, resentment: 4, emotions: { anger: 6, sadness: 3 } },
  hostile: { warmth: -6, trust: -6, affection: -2, resentment: 8, emotions: { anger: 10, fear: 4, sadness: 4 } },
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const first = (c: Pick<CitizenAgent, "name">) => c.name.split(" ")[0];

/** Everything the game master needs to read the player's words against the scene. */
export function actRequest(city: CityState, text: string, actor: CitizenAgent | null, target: CitizenAgent | null, cityTime: string, bond: ActionTools["bond"]): ActRequest {
  const place = (id: string) => city.locations.find((l) => l.location_id === id)?.name ?? id;
  const feel = actor && target ? bond(target.citizen_id, actor.citizen_id) : undefined;
  return {
    kind: actor ? "action" : "situation", text: text.trim().slice(0, 400), city_time: cityTime, actor, target,
    people: city.citizens.map((c) => ({ citizen_id: c.citizen_id, name: c.name, age: c.age, location: place(c.current_location_id),
      activity: c.current_activity, relation_to_actor: actor && c !== actor ? relationName(city, actor, c) ?? "" : "" })),
    places: city.locations.map((l) => ({ location_id: l.location_id, name: l.name })),
    bond: feel ? `${first(target!)} sees ${first(actor!)} as: ${bondLabel(feel)} (warmth ${Math.round(feel.warmth)}, trust ${Math.round(feel.trust)}).` : "",
  };
}

/** Romance between relatives is never allowed, whatever the words. */
export function actBlocked(city: CityState, actor: CitizenAgent | null, target: CitizenAgent | null, act: ActInterpretation) {
  if (!act.allowed) return act.refusal || "That can't happen in Nakameguro.";
  const romantic = act.tone === "romantic" || ["date", "engagement", "marriage", "move_in"].includes(act.proposal);
  if (romantic && actor && target && actor.life?.partner_id !== target.citizen_id && relatives(city, actor).includes(target.citizen_id)) return "They are family.";
  if (actor && target && actor === target) return "Choose someone else.";
  return null;
}

/** Applies the interpreted act with capped effects; the people involved then react in their own words. */
/** A whole number in range; anything non-numeric or non-finite counts as nothing. */
const level = (value: unknown, max: number) => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0);

export function applyAct(city: CityState, raw: ActInterpretation, text: string, actor: CitizenAgent | null, target: CitizenAgent | null, tools: ActionTools): AppliedAct {
  // Whatever the game master returns, effects stay finite and within their caps.
  const act: ActInterpretation = { ...raw, intensity: level(raw.intensity, 3), harm: level(raw.harm, 3), money: level(raw.money, 1000),
    tone: raw.tone in toneEffect ? raw.tone : "neutral", involved_ids: Array.isArray(raw.involved_ids) ? raw.involved_ids.filter((i) => typeof i === "string") : [],
    headline: String(raw.headline ?? "").trim() || "Something happened." };
  const day = city.clock.day;
  const byId = (id: string) => city.citizens.find((c) => c.citizen_id === id);
  const involved = act.involved_ids.map(byId).filter((c): c is CitizenAgent => !!c);
  const main = target ?? byId(act.target_id) ?? involved.find((c) => c !== actor) ?? null;
  const location_id = act.location_id || main?.current_location_id || actor?.current_location_id || "loc_park";
  // The people it involves come together where it happens.
  if (actor && main) { actor.current_location_id = main.current_location_id; actor.x = actor.target_x = main.x; actor.y = actor.target_y = main.y; }
  else if (!actor && act.location_id) for (const c of involved) { c.current_location_id = act.location_id; }
  const steps = 1 + act.intensity;
  const fx = toneEffect[act.tone] ?? toneEffect.neutral;
  const icon = act.harm > 0 ? "💥" : toneIcon[act.tone] ?? "💬";
  let headline = act.headline.trim().slice(0, 220);

  if (main?.life) for (const [key, value] of Object.entries(fx.emotions)) main.life.emotions[key as keyof Emotions] = clamp(main.life.emotions[key as keyof Emotions] + value * steps);
  if (actor && main) {
    tools.adjustBonds([
      { from: main.citizen_id, to: actor.citizen_id, warmth: fx.warmth * steps, trust: fx.trust * steps, familiarity: 3,
        feelings: { affection: fx.affection * steps, resentment: fx.resentment * steps }, reason: headline },
      { from: actor.citizen_id, to: main.citizen_id, familiarity: 3, reason: headline },
    ]);
    // Onlookers judge what they saw.
    // Only people awake and right there see it.
    const onlookers = city.citizens.filter((c) => c !== actor && c !== main && c.current_location_id === main.current_location_id && !/sleep/i.test(c.current_activity));
    const judgement = act.tone === "hostile" ? -2 * steps : act.tone === "tense" ? -steps : act.tone === "warm" ? 1 : 0;
    if (judgement) tools.adjustBonds(onlookers.map((o) => ({ from: o.citizen_id, to: actor.citizen_id, trust: judgement, warmth: judgement, reason: `I saw this: ${headline}` })));
    if (onlookers.length && act.tone !== "neutral") headline += ` ${onlookers.length} ${onlookers.length === 1 ? "person" : "people"} saw it.`;
    tools.sink({ kind: "act", icon, headline, actors: [actor.citizen_id, main.citizen_id], priority: act.intensity >= 2 ? 3 : 2, location_id,
      memories: [
        { citizen_id: main.citizen_id, content: act.target_memory || `${actor.name}: ${headline}`, importance: 0.5 + act.intensity * 0.15, related_citizen_id: actor.citizen_id },
        { citizen_id: actor.citizen_id, content: `I did this: ${text.trim().slice(0, 200)}`, importance: 0.5 + act.intensity * 0.15, related_citizen_id: main.citizen_id },
        ...onlookers.slice(0, 6).map((o) => ({ citizen_id: o.citizen_id, content: `I saw this happen: ${headline}`, importance: 0.45 + act.intensity * 0.1, related_citizen_id: actor.citizen_id })),
      ] });
    // Money changes hands only if the giver has it.
    const money = Math.min(act.money, Math.max(0, Math.floor(actor.money)));
    if (money) { actor.money -= money; main.money += money; }
    if (act.proposal === "breakup" && actor.life?.partner_id === main.citizen_id) endRelationship(city, actor, main, tools);
  } else {
    // A situation: it happens to people, nobody does it.
    tools.sink({ kind: "situation", icon: act.closes_location ? "🚧" : "✨", headline, actors: involved.map((c) => c.citizen_id), priority: 3, location_id,
      memories: involved.map((c, i) => ({ citizen_id: c.citizen_id, content: i === 0 && act.target_memory ? act.target_memory : `This happened to me: ${headline}`, importance: 0.5 + act.intensity * 0.15, related_citizen_id: null })) });
  }
  if (main?.life && act.harm > 0) {
    const injury = catchCondition(main, "minor injury", day);
    if (injury) injury.severity = clamp(15 * act.harm);
    main.health = clamp(main.health - 4 * act.harm);
    if (actor) actor.stress = clamp(actor.stress + 6 * act.harm);
  }
  if (act.closes_location) {
    const until = day * 1440 + 1439;
    city.incidents = [...(city.incidents ?? []).filter((i) => i.location_id !== location_id), { id: `closure-${day}-${location_id}`, kind: "closure", location_id, until }];
  }
  const partner = actor && main ? actor : involved.find((c) => c !== main) ?? null;
  return { headline, icon, target: main, pair: main && partner ? [partner, main] : null, location_id };
}

/** Once the person asked has answered in their own words, a relationship step happens only if they said yes. */
export function resolveProposal(city: CityState, proposal: Proposal, actor: CitizenAgent, target: CitizenAgent, accepted: boolean, tools: ActionTools) {
  if (proposal === "none" || proposal === "breakup" || !actor.life || !target.life) return null;
  const pair = `${actor.name} and ${target.name}`;
  if (!accepted) {
    const headline = `${target.name} said no to ${first(actor)}.`;
    tools.sink({ kind: "declined", icon: "🙅", headline, actors: [actor.citizen_id, target.citizen_id], priority: 2,
      memories: [{ citizen_id: actor.citizen_id, content: `${target.name} turned me down.`, importance: 0.75, related_citizen_id: target.citizen_id }] });
    return headline;
  }
  const la = actor.life, lb = target.life;
  const free = (l: typeof la) => ["single", "widowed"].includes(l.relationship_status) && !l.partner_id;
  const together = la.partner_id === target.citizen_id && lb.partner_id === actor.citizen_id;
  let headline: string | null = null;
  if (proposal === "date") {
    if (free(la) && free(lb)) {
      for (const [l, other] of [[la, target], [lb, actor]] as const) { l.relationship_status = "dating"; l.partner_id = other.citizen_id; l.dating_since = city.clock.day; }
      headline = `${pair} have started dating.`;
    } else if (!together) {
      const taken = [actor, target].find((c) => c.life && !free(c.life));
      headline = `${target.name} said yes to a date with ${first(actor)}, even though ${first(taken!)} is already with someone.`;
    }
  } else if (proposal === "engagement" || proposal === "marriage") {
    if (together || (free(la) && free(lb))) {
      if (!together) for (const [l, other] of [[la, target], [lb, actor]] as const) { l.relationship_status = "dating"; l.partner_id = other.citizen_id; l.dating_since = city.clock.day; }
      const day = city.clock.day, saturday = day + ((6 - (((day - 1) % 7) + 1) + 7) % 7 || 7);
      city.gatherings = [...(city.gatherings ?? []).filter((g) => !(g.kind === "wedding" && g.host_ids.includes(actor.citizen_id))),
        { id: `wedding-${actor.citizen_id}-${target.citizen_id}`, kind: "wedding", title: `${first(actor)} & ${first(target)}'s wedding`,
          host_ids: [actor.citizen_id, target.citizen_id], guest_ids: [...new Set([...relatives(city, actor), ...relatives(city, target)])], location_id: "loc_park", day: saturday, start: 840, end: 1020 }];
      headline = `${pair} are engaged! The wedding is in the park on day ${saturday}.`;
    } else headline = `${target.name} said yes to ${first(actor)}, but one of them is already with someone else.`;
  } else if (proposal === "move_in" && together) {
    lb.household_id = la.household_id;
    target.home_location_id = actor.home_location_id;
    headline = `${target.name} is moving in with ${first(actor)}.`;
  }
  if (headline) tools.sink({ kind: proposal === "date" ? "dating" : proposal === "move_in" ? "move_in" : "engaged", icon: proposal === "date" ? "💕" : proposal === "move_in" ? "🏠" : "💍",
    headline, actors: [actor.citizen_id, target.citizen_id], priority: 3,
    memories: [actor, target].map((p) => ({ citizen_id: p.citizen_id, content: headline!, importance: 0.9, related_citizen_id: (p === actor ? target : actor).citizen_id })) });
  return headline;
}

function endRelationship(city: CityState, a: CitizenAgent, b: CitizenAgent, tools: ActionTools) {
  for (const l of [a.life!, b.life!]) { l.relationship_status = "single"; l.partner_id = null; l.emotions.sadness = clamp(l.emotions.sadness + 30); }
  city.gatherings = (city.gatherings ?? []).filter((g) => !(g.kind === "wedding" && g.host_ids.includes(a.citizen_id) && g.host_ids.includes(b.citizen_id)));
  tools.sink({ kind: "breakup", icon: "💔", headline: `${a.name} and ${b.name} have broken up.`, actors: [a.citizen_id, b.citizen_id], priority: 3,
    memories: [a, b].map((p) => ({ citizen_id: p.citizen_id, content: `${first(p === a ? b : a)} and I broke up. It hurts.`, importance: 0.85, related_citizen_id: (p === a ? b : a).citizen_id })) });
}
