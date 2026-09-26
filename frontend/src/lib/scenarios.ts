import { catchCondition, isAdult, relatives, roll } from "./life";
import type { LifeSink } from "./life";
import type { CitizenAgent, CityState, Feelings } from "./types";

// "Play god": the player sets up a situation and the residents react in character.
// Mechanics (money, injuries, closures, feelings) are decided here; when the city runs in Auto,
// the people involved then talk it through in their own AI-generated words.

export type ScenarioKind = "drop_money" | "accident" | "fire" | "lottery" | "love_spark" | "rivalry" | "lost_puppy" | "act_of_kindness";
export type ScenarioRequest = { kind: ScenarioKind; location_id?: string; citizen_ids?: string[]; amount?: number };
export type BondChange = { from: string; to: string; trust?: number; warmth?: number; familiarity?: number; feelings?: Partial<Feelings>; reason: string };
export type Incident = { id: string; kind: "fire" | "accident"; location_id: string; until: number };
export type ScenarioResult = { headline: string; focus_id: string | null };

export const scenarioCatalog: Array<{ kind: ScenarioKind; icon: string; title: string; blurb: string; needs: Array<"place" | "person" | "pair" | "amount"> }> = [
  { kind: "drop_money", icon: "💴", title: "Drop money on the street", blurb: "Who hands it in at the police box, and who keeps it?", needs: ["place", "amount"] },
  { kind: "accident", icon: "🚲", title: "Bicycle accident", blurb: "Someone gets knocked down. Who stops to help?", needs: ["place"] },
  { kind: "fire", icon: "🔥", title: "Fire in a building", blurb: "Everyone evacuates; the building closes for the day.", needs: ["place"] },
  { kind: "lottery", icon: "🎟️", title: "Lottery win", blurb: "A big win. Do they share it? Who gets jealous?", needs: ["person"] },
  { kind: "love_spark", icon: "💘", title: "Spark of love", blurb: "Two grown-ups feel a spark. Children get a friendship spark instead.", needs: ["pair"] },
  { kind: "rivalry", icon: "😠", title: "A misunderstanding", blurb: "Two people fall out. Will they make up?", needs: ["pair"] },
  { kind: "lost_puppy", icon: "🐶", title: "Lost puppy", blurb: "A shiba puppy is lost. Who looks after it?", needs: ["place"] },
  { kind: "act_of_kindness", icon: "🎁", title: "Secret gift", blurb: "Someone finds an anonymous gift and thank-you note.", needs: ["person"] },
];

type Tools = {
  sink: LifeSink;
  adjustBonds: (changes: BondChange[]) => void;
  cityMinute: number;
};

const first = (c: Pick<CitizenAgent, "name">) => c.name.split(" ")[0];
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const nature = (c: CitizenAgent) => JSON.stringify(c.personality.nature ?? {}).toLowerCase();

/** How likely someone is to do the right thing, 0-100: character, money pressure, stress and culture. */
export function honesty(c: CitizenAgent) {
  const text = nature(c);
  let score = 68; // Japan returns most lost wallets; start high.
  if (/honest|principled|reliable|fair|trust|promise|kind|warm|loyal|care/.test(text)) score += 18;
  if (/impulsive|proud|restless|ambitious|stubborn/.test(text)) score -= 12;
  if (c.money < 80) score -= 18;
  if (c.stress > 70) score -= 8;
  if (c.age < 13) score += 6;
  return clamp(score);
}
export const kindness = (c: CitizenAgent) => clamp(55 + (/kind|warm|care|patient|gentle|protective|generous/.test(nature(c)) ? 25 : 0) - (c.stress > 75 ? 15 : 0));

function peopleAt(city: CityState, locationId: string) {
  return city.citizens.filter((c) => c.current_location_id === locationId && c.age >= 5 && !/sleep/i.test(c.current_activity));
}
function nearest(city: CityState, locationId: string, exclude: string[] = []) {
  const place = city.locations.find((l) => l.location_id === locationId);
  if (!place) return undefined;
  return city.citizens.filter((c) => c.age >= 5 && !exclude.includes(c.citizen_id) && !/sleep/i.test(c.current_activity))
    .sort((a, b) => Math.abs(a.x - place.x) + Math.abs(a.y - place.y) - (Math.abs(b.x - place.x) + Math.abs(b.y - place.y)))[0];
}
const placeName = (city: CityState, id: string) => city.locations.find((l) => l.location_id === id)?.name ?? "town";
const police = (city: CityState) => city.citizens.find((c) => c.life?.job?.location_id === "loc_police");

function meet(city: CityState, actor: CitizenAgent, target: CitizenAgent, reason: string, topic: string, now: number) {
  if (actor === target) return;
  city.encounter = { actor_id: actor.citizen_id, target_id: target.citizen_id, location_id: target.current_location_id, reason, topic, started_at: now };
}

export function applyScenario(city: CityState, request: ScenarioRequest, tools: Tools): ScenarioResult {
  const { sink, adjustBonds, cityMinute: now } = tools;
  const day = city.clock.day, tick = city.clock.tick;
  const r = (label: string) => roll(day, tick, request.kind, label);
  const location = request.location_id ?? city.locations[0].location_id;
  const where = placeName(city, location);
  const pick = (i: number) => city.citizens.find((c) => c.citizen_id === request.citizen_ids?.[i]);
  const fear = (people: CitizenAgent[], amount: number) => people.forEach((p) => p.life && (p.life.emotions.fear = clamp(p.life.emotions.fear + amount)));

  if (request.kind === "drop_money") {
    const amount = Math.max(1, Math.min(5000, request.amount ?? 100));
    const here = peopleAt(city, location);
    const finder = here.length ? here[Math.floor(r("finder") * here.length)] : nearest(city, location);
    if (!finder) throw new Error("Nobody is around to find the money.");
    const honest = r("honest") * 100 < honesty(finder);
    const witnesses = here.filter((c) => c !== finder);
    const witness = !honest && witnesses.length && r("seen") < 0.5 ? witnesses[Math.floor(r("witness") * witnesses.length)] : undefined;
    const officer = police(city);
    if (honest) {
      const reward = Math.round(amount * 0.1);
      finder.money += reward;
      finder.reputation = clamp(finder.reputation + 6);
      if (finder.life) finder.life.emotions.joy = clamp(finder.life.emotions.joy + 20);
      if (officer && officer !== finder) meet(city, finder, officer, `${finder.name} found ${amount} dollars in cash near ${where} and wants to hand it in at the police box.`, "money found on the street", now);
      sink({ kind: "honesty", icon: "💴", headline: `${finder.name} found $${amount} near ${where} and handed it in at the koban. The owner gave a $${reward} thank-you reward.`, actors: [finder.citizen_id], priority: 2, location_id: location,
        memories: [{ citizen_id: finder.citizen_id, content: `I found $${amount} on the ground near ${where}. It wasn't mine, so I took it to the police box. The owner thanked me with $${reward}.`, importance: 0.75 }] });
    } else {
      finder.money += amount;
      const guilty = /principled|honest|reliable|earnest|kind/.test(nature(finder));
      if (finder.life) finder.life.emotions[guilty ? "sadness" : "joy"] = clamp(finder.life.emotions[guilty ? "sadness" : "joy"] + 20);
      if (witness) {
        adjustBonds([{ from: witness.citizen_id, to: finder.citizen_id, trust: -18, warmth: -8, feelings: { resentment: 10 }, reason: `I saw ${first(finder)} pocket money they found on the street.` }]);
        meet(city, witness, finder, `${witness.name} saw ${finder.name} pick up money from the street near ${where} and keep it.`, "the money that was kept", now);
      }
      sink({ kind: "temptation", icon: "🤫", headline: `${finder.name} found $${amount} near ${where} and kept it${witness ? `, but ${witness.name} saw everything` : ""}.`, actors: [finder.citizen_id, ...(witness ? [witness.citizen_id] : [])], priority: 2, location_id: location,
        memories: [{ citizen_id: finder.citizen_id, content: `I found $${amount} on the street near ${where} and kept it.${guilty ? " I feel bad about it." : " Lucky day."}`, importance: 0.7 },
          ...(witness ? [{ citizen_id: witness.citizen_id, content: `I saw ${finder.name} pick up money near ${where} and keep it. I'm disappointed.`, importance: 0.7, related_citizen_id: finder.citizen_id }] : [])] });
    }
    return { headline: honest ? `${first(finder)} handed the money in.` : `${first(finder)} kept the money.`, focus_id: finder.citizen_id };
  }

  if (request.kind === "accident") {
    const here = peopleAt(city, location);
    const victim = here.length ? here[Math.floor(r("victim") * here.length)] : nearest(city, location);
    if (!victim?.life) throw new Error("Nobody is around.");
    const injury = catchCondition(victim, "minor injury", day);
    if (injury) injury.severity = 46;
    const helpers = city.citizens.filter((c) => c !== victim && c.current_location_id === victim.current_location_id && c.age >= 10).sort((a, b) => kindness(b) - kindness(a));
    const helper = helpers.find((h) => r(h.citizen_id) * 100 < kindness(h));
    fear([victim, ...helpers], 25);
    city.incidents = [...(city.incidents ?? []), { id: `accident-${tick}`, kind: "accident", location_id: victim.current_location_id, until: now + 90 }];
    if (helper) {
      adjustBonds([{ from: victim.citizen_id, to: helper.citizen_id, trust: 12, warmth: 12, feelings: { admiration: 12 }, reason: `${first(helper)} stopped to help me after the accident.` }]);
      meet(city, helper, victim, `${helper.name} rushed over to help ${victim.name}, who was knocked down by a bicycle near ${placeName(city, victim.current_location_id)}.`, "the bicycle accident", now);
    }
    sink({ kind: "accident", icon: "🚲", headline: `${victim.name} was knocked down by a speeding bicycle near ${placeName(city, victim.current_location_id)}.${helper ? ` ${helper.name} stopped to help and called an ambulance.` : helpers.length ? " People stared, but nobody stepped in." : ""}`,
      actors: [victim.citizen_id, ...(helper ? [helper.citizen_id] : [])], priority: 3, location_id: victim.current_location_id,
      memories: [{ citizen_id: victim.citizen_id, content: `A bicycle knocked me down today. It really hurt.${helper ? ` ${helper.name} helped me.` : ""}`, importance: 0.8, related_citizen_id: helper?.citizen_id ?? null },
        ...helpers.map((h) => ({ citizen_id: h.citizen_id, content: h === helper ? `I helped ${victim.name} after a bicycle crashed into them.` : `I saw ${victim.name} get knocked down by a bicycle.`, importance: 0.6, related_citizen_id: victim.citizen_id }))] });
    return { headline: `${first(victim)} is hurt.`, focus_id: victim.citizen_id };
  }

  if (request.kind === "fire") {
    const inside = peopleAt(city, location);
    const smoke = inside.filter((c) => r(`smoke-${c.citizen_id}`) < 0.12);
    for (const c of smoke) { const hurt = catchCondition(c, "minor injury", day); if (hurt) hurt.severity = 42; }
    fear(inside, 45);
    fear(city.citizens.filter((c) => !inside.includes(c)), 8);
    city.incidents = [...(city.incidents ?? []), { id: `fire-${tick}`, kind: "fire", location_id: location, until: now + 240 }];
    const workers = city.citizens.filter((c) => c.life?.job?.location_id === location);
    sink({ kind: "fire", icon: "🔥", headline: `Fire at ${where}! ${inside.length ? `${inside.length} people evacuated safely` : "The building was empty"}${smoke.length ? `; ${smoke.map((s) => s.name).join(" and ")} breathed in smoke` : ""}. Firefighters are on the scene and it is closed for the day.`,
      actors: [...inside, ...workers].map((c) => c.citizen_id), priority: 3, location_id: location,
      memories: [...new Set([...inside, ...workers])].map((c) => ({ citizen_id: c.citizen_id, content: inside.includes(c) ? `There was a fire at ${where} while I was inside. We all got out, but I was scared.` : `There was a fire at ${where}, where I work. I hope everything is okay.`, importance: 0.85 })) });
    const [a, b] = inside.length >= 2 ? inside : [workers[0], inside[0] ?? workers[1]];
    if (a && b && a !== b) meet(city, a, b, `A fire broke out at ${where} and they just evacuated together.`, "the fire", now);
    return { headline: `${where} is on fire.`, focus_id: inside[0]?.citizen_id ?? null };
  }

  if (request.kind === "lottery") {
    const winner = pick(0) ?? city.citizens.filter(isAdult)[Math.floor(r("winner") * city.citizens.filter(isAdult).length)];
    if (!winner) throw new Error("Choose who wins.");
    const prize = winner.age < 18 ? 500 : 10000;
    winner.money += prize;
    if (winner.life) winner.life.emotions.joy = clamp(winner.life.emotions.joy + 60);
    const family = relatives(city, winner).map((id) => city.citizens.find((c) => c.citizen_id === id)).filter((c) => c !== undefined);
    const generous = kindness(winner) > 65;
    if (generous) for (const f of family) { const share = Math.round(prize * 0.1); winner.money -= share; f.money += share; }
    const jealous = city.citizens.filter((c) => c !== winner && !family.includes(c) && c.money < 300 && isAdult(c)).slice(0, 3);
    adjustBonds(jealous.map((c) => ({ from: c.citizen_id, to: winner.citizen_id, feelings: { jealousy: 15 }, reason: `${first(winner)} won the lottery and I'm struggling to pay bills.` })));
    const friend = city.citizens.filter((c) => c !== winner && c.age >= 5).sort((a, b) => Number(family.includes(b)) - Number(family.includes(a)))[0];
    if (friend) meet(city, winner, friend, `${winner.name} just won $${prize} in the ${winner.age < 18 ? "school raffle" : "lottery"} and can't wait to share the news.`, "the lottery win", now);
    sink({ kind: "lottery", icon: "🎟️", headline: `${winner.name} won $${prize} in the ${winner.age < 18 ? "school raffle" : "lottery"}!${generous && family.length ? ` ${first(winner)} shared some with family.` : ""}${jealous.length ? ` Not everyone is happy for them.` : ""}`,
      actors: [winner.citizen_id], priority: 2, memories: [{ citizen_id: winner.citizen_id, content: `I won $${prize}! I still can't believe it.`, importance: 0.9 }] });
    return { headline: `${first(winner)} is rich!`, focus_id: winner.citizen_id };
  }

  if (request.kind === "love_spark" || request.kind === "rivalry") {
    const [a, b] = [pick(0), pick(1)];
    if (!a || !b || a === b) throw new Error("Choose two different people.");
    if (request.kind === "rivalry") {
      adjustBonds([
        { from: a.citizen_id, to: b.citizen_id, trust: -15, warmth: -18, feelings: { resentment: 25 }, reason: `I heard ${first(b)} said something unkind about me behind my back.` },
        { from: b.citizen_id, to: a.citizen_id, trust: -10, warmth: -12, feelings: { resentment: 15 }, reason: `${first(a)} has been cold to me and I don't know why.` },
      ]);
      for (const p of [a, b]) if (p.life) p.life.emotions.anger = clamp(p.life.emotions.anger + 30);
      meet(city, a, b, `${a.name} heard a rumour that ${b.name} said something unkind behind their back, and wants to confront them.`, "the rumour and the misunderstanding", now);
      sink({ kind: "rivalry", icon: "😠", headline: `A rumour has turned ${a.name} and ${b.name} against each other. Will they talk it out?`, actors: [a.citizen_id, b.citizen_id], priority: 2,
        memories: [{ citizen_id: a.citizen_id, content: `Someone told me ${b.name} talked about me behind my back. I'm hurt and angry.`, importance: 0.8, related_citizen_id: b.citizen_id },
          { citizen_id: b.citizen_id, content: `${a.name} is suddenly cold to me. I don't know what I did.`, importance: 0.7, related_citizen_id: a.citizen_id }] });
      return { headline: `${first(a)} and ${first(b)} fell out.`, focus_id: a.citizen_id };
    }
    const romance = isAdult(a) && isAdult(b) && !relatives(city, a).includes(b.citizen_id);
    const change = romance ? { trust: 18, warmth: 26, familiarity: 12, feelings: { affection: 30, admiration: 12 } } : { trust: 14, warmth: 20, familiarity: 12, feelings: { affection: 12 } };
    adjustBonds([
      { from: a.citizen_id, to: b.citizen_id, ...change, reason: romance ? `I can't stop thinking about ${first(b)}.` : `${first(b)} and I really clicked today.` },
      { from: b.citizen_id, to: a.citizen_id, ...change, reason: romance ? `${first(a)} makes me smile.` : `${first(a)} is fun to be around.` },
    ]);
    for (const p of [a, b]) if (p.life) p.life.emotions.joy = clamp(p.life.emotions.joy + 25);
    meet(city, a, b, romance ? `${a.name} has feelings for ${b.name} and has finally worked up the courage to ask them out for dinner.` : `${a.name} and ${b.name} suddenly discovered they have a lot in common.`, romance ? "asking them out" : "their new friendship", now);
    sink({ kind: romance ? "spark" : "friendship", icon: romance ? "💘" : "🤝", headline: romance ? `${a.name} and ${b.name} feel a spark between them.` : `${a.name} and ${b.name} have become fast friends.`, actors: [a.citizen_id, b.citizen_id], priority: 2 });
    return { headline: romance ? "Love is in the air." : "A new friendship.", focus_id: a.citizen_id };
  }

  if (request.kind === "lost_puppy") {
    const here = peopleAt(city, location);
    const finder = [...here].sort((x, y) => kindness(y) - kindness(x))[0] ?? nearest(city, location);
    if (!finder) throw new Error("Nobody is around.");
    const keeps = finder.age < 18 && r("keep") < 0.3;
    const officer = police(city);
    if (finder.life) finder.life.emotions.joy = clamp(finder.life.emotions.joy + 30);
    if (officer && officer !== finder && !keeps) meet(city, finder, officer, `${finder.name} found a lost shiba puppy near ${where} and wants help finding its owner.`, "the lost puppy", now);
    sink({ kind: "puppy", icon: "🐶", headline: keeps ? `${finder.name} found a lost shiba puppy near ${where} and is begging to keep it!` : `${finder.name} found a lost shiba puppy near ${where} and took it to the police box to find its owner.`,
      actors: [finder.citizen_id], priority: 2, memories: [{ citizen_id: finder.citizen_id, content: `I found a tiny lost shiba puppy near ${where} today. It licked my hand!`, importance: 0.75 }] });
    return { headline: `${first(finder)} found a puppy.`, focus_id: finder.citizen_id };
  }

  const person = pick(0) ?? city.citizens[Math.floor(r("gift") * city.citizens.length)];
  if (!person?.life) throw new Error("Choose someone.");
  person.life.emotions.joy = clamp(person.life.emotions.joy + 35);
  person.life.loneliness = clamp(person.life.loneliness - 25);
  sink({ kind: "kindness", icon: "🎁", headline: `${person.name} found an anonymous gift and a note: "Thank you for being you."`, actors: [person.citizen_id], priority: 2,
    memories: [{ citizen_id: person.citizen_id, content: "Someone left me a gift and a kind note, with no name. It made my whole day.", importance: 0.7 }] });
  const friend = city.citizens.find((c) => c !== person && c.current_location_id === person.current_location_id && c.age >= 5);
  if (friend) meet(city, person, friend, `${person.name} just found an anonymous gift with a kind note and wonders who sent it.`, "the secret gift", now);
  return { headline: `${first(person)} got a surprise.`, focus_id: person.citizen_id };
}

export function activeIncidents(city: CityState, now: number) {
  return (city.incidents ?? []).filter((i) => i.until > now);
}
