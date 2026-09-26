import { calendarDay } from "./calendar";
import type {
  CitizenAgent,
  CityState,
  DepartedCitizen,
  Emotions,
  Gathering,
  HealthCondition,
  LifeStage,
  LifeState,
  Relationship,
} from "./types";

// One city day is one day of life: everyone ages by a day at midnight.
export const DAYS_PER_YEAR = 365;
export const PREGNANCY_DAYS = 280;

export const ageInDays = (life: Pick<LifeState, "birth_day">, day: number) => day - life.birth_day;
export const ageInYears = (life: Pick<LifeState, "birth_day">, day: number) => Math.floor(ageInDays(life, day) / DAYS_PER_YEAR);
export function daysUntilBirthday(life: Pick<LifeState, "birth_day">, day: number) {
  const into = ((ageInDays(life, day) % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return into === 0 ? 0 : DAYS_PER_YEAR - into;
}
export function lifeStage(years: number): LifeStage {
  if (years < 2) return "baby";
  if (years < 13) return "child";
  if (years < 18) return "teen";
  if (years < 65) return "adult";
  return "elder";
}
export const stageOf = (citizen: Pick<CitizenAgent, "age">) => lifeStage(citizen.age);
/** Older bodies cannot get back to full health; this is the best they can reach. */
export const healthCap = (age: number) => (age >= 60 ? clamp(100 - (age - 60) * 1.1) : 100);
// Wages are paid after income tax.
const TAX = 0.25;
export const isAdult = (citizen: Pick<CitizenAgent, "age">) => citizen.age >= 18;
/** Babies and toddlers do not hold AI conversations. */
export const canConverse = (citizen: Pick<CitizenAgent, "age">) => citizen.age >= 3;

/** Deterministic randomness: the same world and day always produce the same life events. */
export function roll(...parts: Array<string | number>) {
  let hash = 2166136261;
  for (const char of parts.join("|")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 2246822507) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const first = (citizen: Pick<CitizenAgent, "name">) => citizen.name.split(" ")[0];
const zeroToday = (): NonNullable<LifeState["today"]> => ({ meals: 0, workout: 0, work: 0, study: 0, hobby: 0, social: 0 });
const baseline: Emotions = { joy: 40, sadness: 8, anger: 5, fear: 8 };

/** Typical body for an age, used when a profile or an old save has no body data. */
export function typicalBody(years: number, sex: "female" | "male") {
  const growth = [50, 75, 87, 96, 103, 110, 116, 122, 128, 133, 138, 143, 149, 156, 162, 166, 169, 171];
  const height = years < growth.length ? growth[years] : sex === "male" ? 176 : 163;
  const adultHeight = sex === "male" ? 176 : 163;
  const h = Math.min(height, adultHeight) - (years > 70 ? (years - 70) * 0.15 : 0);
  const bmi = years < 2 ? 16.5 : years < 13 ? 16.8 : years < 18 ? 19.5 : 23.5;
  return { height_cm: round(h), weight_kg: round(bmi * (h / 100) ** 2) };
}

export function defaultLife(citizen: CitizenAgent, day: number): LifeState {
  const sex = roll(citizen.citizen_id, "sex") < 0.5 ? "female" : "male";
  const birthdayIn = 1 + Math.floor(roll(citizen.citizen_id, "birthday") * 364);
  return {
    birth_day: day + birthdayIn - (citizen.age + 1) * DAYS_PER_YEAR,
    sex,
    ...typicalBody(citizen.age, sex),
    fitness: 55,
    emotions: { ...baseline },
    loneliness: 25,
    household_id: "home_a",
    parent_ids: [],
    partner_id: null,
    children_ids: [],
    relationship_status: "single",
    job: null,
    grade: citizen.profession === "Student" ? 70 : undefined,
    ambition: null,
    conditions: [],
    pregnancy: null,
  };
}

/** Fills in any missing life data so older saves keep working. */
export function ensureLife(citizen: CitizenAgent, day: number) {
  const fallback = defaultLife(citizen, day);
  citizen.life = { ...fallback, ...citizen.life, emotions: { ...fallback.emotions, ...citizen.life?.emotions } };
  return citizen.life;
}

export type LifeNews = {
  kind: string;
  icon: string;
  headline: string;
  actors: string[];
  priority?: number;
  location_id?: string | null;
  /** Private memories written for the people involved. */
  memories?: Array<{ citizen_id: string; content: string; importance: number; related_citizen_id?: string | null }>;
};
export type LifeSink = (news: LifeNews) => void;
export type BondLookup = (from: string, to: string) => Relationship | undefined;

export function relatives(city: CityState, citizen: CitizenAgent) {
  const life = citizen.life;
  if (!life) return [];
  const ids = new Set([...life.parent_ids, ...life.children_ids, ...(life.partner_id ? [life.partner_id] : [])]);
  for (const other of city.citizens) {
    const o = other.life;
    if (!o || other === citizen) continue;
    if (o.parent_ids.some((id) => life.parent_ids.includes(id))) ids.add(other.citizen_id); // siblings
    if (o.parent_ids.some((id) => life.children_ids.includes(id))) ids.add(other.citizen_id); // grandchildren
    if (o.children_ids.some((id) => life.parent_ids.includes(id))) ids.add(other.citizen_id); // grandparents
    if (o.household_id === life.household_id) ids.add(other.citizen_id); // guardians and relatives at home
  }
  ids.delete(citizen.citizen_id);
  return [...ids];
}

/** How `citizen` would describe `other`, e.g. "mother" or "grandfather". */
export function relationName(city: CityState, citizen: CitizenAgent, other: Pick<CitizenAgent, "citizen_id" | "life">) {
  const life = citizen.life;
  const female = other.life?.sex === "female";
  if (!life) return null;
  if (life.parent_ids.includes(other.citizen_id)) return female ? "mother" : "father";
  if (life.children_ids.includes(other.citizen_id)) return female ? "daughter" : "son";
  if (life.partner_id === other.citizen_id) return life.relationship_status === "married" ? (female ? "wife" : "husband") : "partner";
  if (other.life?.parent_ids.some((id) => life.parent_ids.includes(id))) return female ? "sister" : "brother";
  if (other.life?.children_ids.some((id) => life.parent_ids.includes(id))) return female ? "grandmother" : "grandfather";
  if (other.life?.parent_ids.some((id) => life.children_ids.includes(id))) return female ? "granddaughter" : "grandson";
  if (life.parent_ids.some((id) => city.citizens.find((c) => c.citizen_id === id)?.life?.partner_id === other.citizen_id)) return female ? "stepmother" : "stepfather";
  const partner = city.citizens.find((c) => c.citizen_id === life.partner_id)?.life;
  if (partner?.parent_ids.includes(other.citizen_id)) return female ? "mother-in-law" : "father-in-law";
  if (other.life?.partner_id && life.children_ids.includes(other.life.partner_id)) return female ? "daughter-in-law" : "son-in-law";
  if (other.life?.household_id === life.household_id) {
    const otherAge = city.citizens.find((c) => c.citizen_id === other.citizen_id)?.age ?? 0;
    const myAge = city.citizens.find((c) => c.citizen_id === citizen.citizen_id)?.age ?? 0;
    if (otherAge >= 18 && myAge < 18) return female ? "aunt" : "uncle";
    if (myAge >= 18 && otherAge < 18) return female ? "niece" : "nephew";
    return "family";
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Health

type ConditionKind = "cold" | "flu" | "stomach bug" | "sprained ankle" | "asthma flare-up" | "heatstroke" | "minor injury";
const catalog: Record<ConditionKind, { start: number; contagious: boolean; untreated: number; treated: number }> = {
  cold: { start: 24, contagious: true, untreated: -5, treated: -14 },
  flu: { start: 42, contagious: true, untreated: 5, treated: -16 },
  "stomach bug": { start: 34, contagious: false, untreated: -11, treated: -20 },
  "sprained ankle": { start: 40, contagious: false, untreated: -5, treated: -12 },
  "asthma flare-up": { start: 30, contagious: false, untreated: 2, treated: -18 },
  heatstroke: { start: 48, contagious: false, untreated: 4, treated: -28 },
  "minor injury": { start: 32, contagious: false, untreated: -4, treated: -14 },
};

const outdoorPlaces = new Set(["loc_park", "loc_farm", "loc_market", "loc_bus_stop", "loc_shrine"]);

/** One-off effects of an earthquake, a heatwave starting or a typhoon arriving. */
export function weatherEffects(city: CityState, kind: "earthquake" | "heatwave" | "typhoon", intensity: number, sink: LifeSink) {
  const day = city.clock.day;
  if (kind === "earthquake") {
    const strong = intensity >= 4;
    const hurt: CitizenAgent[] = [];
    for (const c of city.citizens) {
      if (!c.life) continue;
      c.life.emotions.fear = clamp(c.life.emotions.fear + (strong ? 45 : 8));
      if (strong) c.stress = clamp(c.stress + 20);
      if (strong && roll(day, city.clock.tick, c.citizen_id, "quake-hurt") < 0.06 && catchCondition(c, "minor injury", day)) hurt.push(c);
    }
    sink({ kind: "earthquake", icon: "🫨", headline: strong
        ? `A strong earthquake (shindo ${intensity}) shook Nakameguro. Everyone is walking to the evacuation area at the school.${hurt.length ? ` ${hurt.map((h) => h.name).join(" and ")} got minor injuries.` : " Nobody was hurt."}`
        : `A small earthquake (shindo ${intensity}) rattled windows around Nakameguro.`,
      actors: hurt.map((h) => h.citizen_id), priority: strong ? 3 : 1,
      memories: strong ? city.citizens.map((c) => ({ citizen_id: c.citizen_id, content: hurt.includes(c)
        ? "A big earthquake hit today and I got hurt. My heart was pounding the whole time."
        : "A big earthquake hit today. Everything shook; we did drop, cover and hold on, then went to the school evacuation area.", importance: 0.85 })) : [] });
  } else if (kind === "typhoon") {
    for (const c of city.citizens) if (c.life) c.life.emotions.fear = clamp(c.life.emotions.fear + 20);
  } else {
    for (const c of city.citizens) if (c.life && c.age >= 65) c.life.emotions.fear = clamp(c.life.emotions.fear + 10);
  }
}

export function catchCondition(citizen: CitizenAgent, kind: ConditionKind, day: number): HealthCondition | null {
  const life = citizen.life!;
  if (life.conditions.some((c) => c.name === kind)) return null;
  const spec = catalog[kind];
  const condition = { id: `${kind}-${day}`, name: kind, severity: spec.start, contagious: spec.contagious, chronic: false, treated: false, since_day: day };
  life.conditions.push(condition);
  life.emotions.fear = clamp(life.emotions.fear + 10);
  return condition;
}

/** The condition that should send someone for care today, if any. */
export function careNeeded(citizen: CitizenAgent, day: number) {
  const conditions = citizen.life?.conditions ?? [];
  const needsDoctor = conditions.find((c) => (!c.chronic && !c.treated && c.severity >= 40)
    || (c.chronic && c.severity >= 45 && (c.treated_until ?? 0) < day));
  if (needsDoctor) return { place: "loc_hospital", condition: needsDoctor };
  const needsMedicine = conditions.find((c) => !c.chronic && !c.treated && c.severity >= 15);
  if (needsMedicine) return { place: "loc_pharmacy", condition: needsMedicine };
  return null;
}
export const bedRest = (citizen: CitizenAgent) => (citizen.life?.conditions ?? []).find((c) => !c.chronic && c.severity >= 50);

// ---------------------------------------------------------------------------------------------
// Every 15 minutes

export function lifeTick(city: CityState, citizen: CitizenAgent, sink: LifeSink, bond: BondLookup) {
  const life = citizen.life;
  if (!life) return;
  const day = city.clock.day;
  const today = (life.today ??= zeroToday());
  const here = citizen.current_location_id;
  const arrived = citizen.x === citizen.target_x && citizen.y === citizen.target_y;
  const activity = citizen.current_activity;
  const asleep = /sleep|nap/i.test(activity);

  for (const key of Object.keys(baseline) as Array<keyof Emotions>)
    life.emotions[key] = clamp(life.emotions[key] + (baseline[key] - life.emotions[key]) * 0.035);
  citizen.happiness = clamp(citizen.happiness + (life.emotions.joy - 40) * 0.004 - life.emotions.sadness * 0.006 - (life.loneliness > 70 ? 0.25 : 0));
  // Everyday life keeps a little background stress; sleep eases it but never to zero.
  citizen.stress = clamp(citizen.stress + (life.emotions.fear + life.emotions.anger) * 0.003 - (asleep && citizen.stress > 15 ? 0.5 : 0));

  if (arrived && !asleep) {
    const company = city.citizens.filter((o) => o !== citizen && o.current_location_id === here && o.x === o.target_x && o.y === o.target_y && !/sleep|nap/i.test(o.current_activity));
    const kin = new Set(relatives(city, citizen));
    const close = company.some((o) => kin.has(o.citizen_id) || (bond(citizen.citizen_id, o.citizen_id)?.warmth ?? 0) >= 55);
    if (company.length) {
      life.loneliness = clamp(life.loneliness - (close ? 3 : 1));
      today.social++;
    } else life.loneliness = clamp(life.loneliness + (citizen.age >= 65 ? 0.8 : 0.35));
    if (life.loneliness > 75) life.emotions.sadness = clamp(life.emotions.sadness + 0.6);
  }

  if (arrived && life.job && here === life.job.location_id && /^Working/.test(activity)) {
    citizen.money = round(citizen.money + (life.job.hourly_wage / 4) * (1 - TAX), 2);
    citizen.stress = clamp(citizen.stress + 0.35);
    today.work++;
  }
  if (life.grade !== undefined && arrived && here === "loc_school" && /school|class/i.test(activity)) {
    // Grades drift toward what this student can do today: their usual level, helped by study and hurt by exhaustion or worry.
    const aptitude = (life.aptitude ??= life.grade);
    const target = aptitude + Math.min(8, life.fitness > 70 ? 2 : 0) - (citizen.stress > 70 ? 12 : 0) - (citizen.energy < 35 ? 8 : 0) - (bedRest(citizen) ? 10 : 0);
    life.grade = clamp(life.grade + (target - life.grade) * 0.01);
    today.study++;
  }
  if (arrived && /library|lab|stor|comic|chess|music|crop|kitchen|pond|football/i.test(activity) && !asleep) {
    today.hobby++;
    if (/football/i.test(activity)) life.fitness = clamp(life.fitness + 0.3);
    // Extra study slowly raises a student's usual level.
    if (life.grade !== undefined && here === "loc_library") life.aptitude = clamp((life.aptitude ?? life.grade) + 0.02);
  }
  // Coaches staff the gym; only their own sessions count as a workout.
  if (arrived && here === "loc_gym" && /work(ing)? out|training/i.test(activity) && life.job?.location_id !== "loc_gym") {
    life.fitness = clamp(life.fitness + 1.1);
    citizen.stress = clamp(citizen.stress - 2);
    citizen.energy = clamp(citizen.energy - 1.2);
    life.emotions.joy = clamp(life.emotions.joy + 1.5);
    today.workout++;
    if (roll(day, city.clock.tick, citizen.citizen_id, "sprain") < 0.004) {
      const injury = catchCondition(citizen, "sprained ankle", day);
      if (injury) sink({ kind: "injury", icon: "🩹", headline: `${citizen.name} sprained an ankle at the gym.`, actors: [citizen.citizen_id], location_id: here,
        memories: [{ citizen_id: citizen.citizen_id, content: "I twisted my ankle while working out. It really hurts and I need to get it looked at.", importance: 0.6 }] });
    }
  }

  for (const condition of life.conditions) {
    const weight = condition.chronic && (condition.treated_until ?? 0) >= day ? 0.3 : 1;
    citizen.health = clamp(citizen.health - condition.severity * 0.004 * weight);
    citizen.energy = clamp(citizen.energy - condition.severity * 0.008 * weight);
  }
  if (life.pregnancy && life.pregnancy.due_day - day < 60) citizen.energy = clamp(citizen.energy - 0.25);
  if (life.job?.location_id === "loc_gym" && here === "loc_gym" && /^Working/.test(activity)) life.fitness = clamp(life.fitness + 0.15);
  // Babies are fed and settled by whoever is looking after them.
  if (citizen.age < 2 && citizen.hunger > 25 && city.citizens.some((c) => c.age >= 12 && c.current_location_id === here && relatives(city, citizen).includes(c.citizen_id))) {
    citizen.hunger = clamp(citizen.hunger - 20);
    citizen.health = clamp(citizen.health + 0.5);
  }
  // A body with no illness, food and rest slowly heals, up to what its age allows.
  if (!life.conditions.some((c) => !c.chronic) && citizen.hunger < 80 && citizen.energy > 25)
    citizen.health = Math.min(healthCap(citizen.age), citizen.health + 0.06);
  // Everyday life always carries a little stress.
  citizen.stress = Math.max(citizen.stress, 8);

  const weather = city.weather;
  const outside = !arrived || outdoorPlaces.has(here);
  if (weather?.heatwave && outside && city.clock.minute_of_day >= 660 && city.clock.minute_of_day < 960
    && roll(day, city.clock.tick, citizen.citizen_id, "heat") < (citizen.age >= 65 || citizen.age < 5 ? 0.02 : 0.004) && catchCondition(citizen, "heatstroke", day))
    sink({ kind: "illness", icon: "🥵", headline: `${citizen.name} got heatstroke outside in the heat and needs to cool down.`, actors: [citizen.citizen_id], priority: 2,
      memories: [{ citizen_id: citizen.citizen_id, content: "I felt dizzy and sick in the heat today. I should have drunk more water.", importance: 0.6 }] });
  if (weather?.condition === "typhoon" && outside && roll(day, city.clock.tick, citizen.citizen_id, "storm") < 0.01 && catchCondition(citizen, "minor injury", day))
    sink({ kind: "injury", icon: "🩹", headline: `${citizen.name} was hurt by flying debris in the typhoon.`, actors: [citizen.citizen_id], priority: 2 });
  if (arrived && (here === "loc_hospital" || here === "loc_clinic" || here === "loc_pharmacy")) treat(city, citizen, here === "loc_clinic" ? "loc_hospital" : here, sink);
  // Elderly bodies recover less completely.
  if (citizen.age >= 60) citizen.health = Math.min(citizen.health, healthCap(citizen.age));
}

function treat(city: CityState, citizen: CitizenAgent, place: string, sink: LifeSink) {
  const life = citizen.life!;
  const day = city.clock.day;
  const doctor = city.citizens.find((c) => c !== citizen && /Doctor/.test(c.life?.job?.title ?? "") && ["loc_hospital", "loc_clinic"].includes(c.current_location_id) && /^Working/.test(c.current_activity));
  for (const condition of life.conditions) {
    if (condition.chronic) {
      if (place !== "loc_hospital" && condition.severity >= 45) continue;
      if ((condition.treated_until ?? 0) >= day + 5) continue;
      condition.treated_until = day + 7;
      payFor(city, citizen, 12);
      sink({ kind: "medication", icon: "💊", headline: `${citizen.name} picked up a week of medicine for their ${condition.name}.`, actors: [citizen.citizen_id], priority: 1, location_id: place });
      continue;
    }
    if (condition.treated || condition.severity < 15) continue;
    if (place === "loc_pharmacy" && condition.severity >= 40) continue;
    condition.treated = true;
    if (place === "loc_pharmacy") payFor(city, citizen, 8);
    life.emotions.fear = clamp(life.emotions.fear - 15);
    const by = place === "loc_hospital" ? (doctor ? `Dr. ${doctor.name}` : "the hospital nurses") : "the pharmacist";
    sink({ kind: "treated", icon: "🩺", headline: `${citizen.name} was treated for ${condition.name === "flu" ? "the flu" : `a ${condition.name}`} by ${by}.`,
      actors: [citizen.citizen_id, ...(doctor ? [doctor.citizen_id] : [])], location_id: place, priority: 2,
      memories: [
        { citizen_id: citizen.citizen_id, content: `I got help for my ${condition.name} from ${by}. I should feel better in a few days.`, importance: 0.55, related_citizen_id: doctor?.citizen_id ?? null },
        ...(doctor ? [{ citizen_id: doctor.citizen_id, content: `I treated ${citizen.name} for ${condition.name === "flu" ? "the flu" : `a ${condition.name}`} at the hospital today.`, importance: 0.45, related_citizen_id: citizen.citizen_id }] : []),
      ] });
  }
}

/** Counts one meal per sitting: several bites within two hours are the same meal. */
/** Adults pay their own costs; a parent or guardian at home pays for children. */
function payFor(city: CityState, citizen: CitizenAgent, amount: number) {
  const payer = citizen.age >= 18 ? citizen : city.citizens.find((c) => c.age >= 18 && relatives(city, citizen).includes(c.citizen_id) && c.life?.household_id === citizen.life?.household_id);
  if (payer) payer.money = round(payer.money - amount, 2);
}

export function recordMeal(citizen: CitizenAgent, tick: number) {
  if (!citizen.life) return;
  const today = (citizen.life.today ??= zeroToday());
  if (today.last_meal_tick !== undefined && tick - today.last_meal_tick < 8) return;
  today.meals++;
  today.last_meal_tick = tick;
}

// ---------------------------------------------------------------------------------------------
// Once per day, at midnight

export type LifeFactory = { newCitizen: (template: CitizenAgent) => void; departed: (citizen: DepartedCitizen) => void };

export function lifeDay(city: CityState, sink: LifeSink, bond: BondLookup, factory: LifeFactory) {
  const day = city.clock.day;
  const people = [...city.citizens];
  for (const citizen of people) if (citizen.life) dailyBody(city, citizen, sink);
  spreadIllness(city, sink);
  for (const citizen of people) if (citizen.life && city.citizens.includes(citizen)) mortality(city, citizen, sink, factory);
  for (const citizen of [...city.citizens]) if (citizen.life?.pregnancy && day >= citizen.life.pregnancy.due_day) giveBirth(city, citizen, sink, factory);
  conception(city, sink);
  romance(city, sink, bond);
  weddings(city, sink);
  if (day % 7 === 1 && day > 1) weeklyMoney(city, sink);
  const today = city.calendar_start ? calendarDay(city.calendar_start, day) : null;
  if (day % 7 === 6 && !today?.schoolBreak) reportCards(city, sink);
  for (const citizen of city.citizens) ambitions(city, citizen, sink, bond);
  for (const citizen of city.citizens) if (citizen.life) citizen.life.today = zeroToday();
  city.gatherings = (city.gatherings ?? []).filter((g) => g.day >= day);
}

function dailyBody(city: CityState, citizen: CitizenAgent, sink: LifeSink) {
  const life = citizen.life!;
  const day = city.clock.day;
  const years = ageInYears(life, day);
  if (years !== citizen.age) {
    const before = lifeStage(citizen.age);
    citizen.age = years;
    birthday(city, citizen, sink);
    const after = lifeStage(years);
    if (after !== before) {
      const line = { child: `${citizen.name} is a little kid now, not a baby any more!`, teen: `${citizen.name} is officially a teenager!`,
        adult: `${citizen.name} is 18: officially an adult!`, elder: `${citizen.name} has reached 65 and is now a senior citizen.`, baby: "" }[after];
      if (line) sink({ kind: "milestone", icon: "🌱", headline: line, actors: [citizen.citizen_id], priority: 2 });
    }
  }
  const today = life.today ?? zeroToday();
  const setWeight = (life.set_weight ??= life.weight_kg);
  if (citizen.age < 18) {
    const adultHeight = life.sex === "male" ? 176 : 163;
    const perYear = citizen.age < 2 ? 20 : citizen.age < 11 ? 6 : citizen.age < 16 ? 7 : 2;
    life.height_cm = round(Math.min(adultHeight + 6, life.height_cm + perYear / DAYS_PER_YEAR), 2);
    life.set_weight = setWeight + (citizen.age < 1 ? 6.5 : citizen.age < 2 ? 2.5 : 3.5) / DAYS_PER_YEAR;
  }
  if (citizen.age >= 5) {
    // Habits move the set point slowly (a couple of kilos a year at most); the body follows it.
    const habit = (Math.min(today.meals, 5) - 4) * 0.006 - today.workout * 0.002;
    const bmi = setWeight / (life.height_cm / 100) ** 2;
    const pull = bmi > 30 ? -0.004 : bmi < 17 ? 0.004 : 0;
    life.set_weight = (life.set_weight ?? setWeight) + Math.max(-0.015, Math.min(0.015, habit + pull));
  }
  life.weight_kg = round(clamp(life.weight_kg + ((life.set_weight ?? setWeight) - life.weight_kg) * 0.05, 2, 180), 2);
  // Everyday walking keeps a baseline; workouts build above it, and fitness fades back toward it without them.
  const base = citizen.age >= 75 ? 18 : citizen.age >= 65 ? 26 : citizen.age < 5 ? 40 : 38;
  if (!today.workout) life.fitness = clamp(life.fitness + (base - life.fitness) * 0.02);
  // Conditions progress overnight.
  for (const condition of [...life.conditions]) {
    if (condition.chronic) {
      const medicated = (condition.treated_until ?? 0) >= day;
      condition.severity = clamp(condition.severity + (medicated ? -0.6 : 1.6), 25, 100);
      if (citizen.stress > 70 && condition.name === "asthma") condition.severity = clamp(condition.severity + 1.5);
      continue;
    }
    const spec = catalog[condition.name as ConditionKind] ?? catalog.cold;
    const peaked = day - condition.since_day >= 3;
    condition.severity = clamp(condition.severity + (condition.treated ? spec.treated : peaked && spec.untreated > 0 ? -8 : spec.untreated));
    if (condition.severity <= 0) {
      life.conditions = life.conditions.filter((c) => c !== condition);
      life.emotions.joy = clamp(life.emotions.joy + 15);
      sink({ kind: "recovered", icon: "💚", headline: `${citizen.name} has recovered from ${condition.name === "flu" ? "the flu" : `a ${condition.name}`}.`, actors: [citizen.citizen_id], priority: 1,
        memories: [{ citizen_id: citizen.citizen_id, content: `I finally feel better after my ${condition.name}.`, importance: 0.4 }] });
    }
  }
  if (citizen.stress > 75 && life.conditions.some((c) => c.name === "asthma") && roll(day, citizen.citizen_id, "flare") < 0.3) catchCondition(citizen, "asthma flare-up", day);
  // A night's sleep resets part of the day's strain.
  if (citizen.stress > 15) citizen.stress = Math.max(15, citizen.stress - 6);
}

function birthday(city: CityState, citizen: CitizenAgent, sink: LifeSink) {
  const life = citizen.life!;
  const day = city.clock.day;
  life.emotions.joy = clamp(life.emotions.joy + 40);
  citizen.happiness = clamp(citizen.happiness + 10);
  const family = relatives(city, citizen);
  if (citizen.age < 1) return;
  const friends = city.citizens.filter((o) => o !== citizen && canConverse(o) && Math.abs(o.age - citizen.age) <= (citizen.age < 18 ? 3 : 25)
    && (city.citizens.length < 3 || roll(day, o.citizen_id, citizen.citizen_id, "invite") < 0.8)).map((o) => o.citizen_id);
  const guests = [...new Set([...family, ...friends])].slice(0, 9);
  const start = citizen.age < 18 ? 1020 : 1110;
  const party: Gathering = { id: `birthday-${citizen.citizen_id}-${day}`, kind: "birthday", title: `${first(citizen)}'s birthday party`,
    host_ids: [citizen.citizen_id], guest_ids: guests, location_id: citizen.age < 18 ? "loc_park" : "loc_restaurant", day, start, end: start + 105 };
  if (citizen.age >= 3) city.gatherings = [...(city.gatherings ?? []), party];
  sink({ kind: "birthday", icon: "🎂", headline: `Happy birthday, ${citizen.name}! ${first(citizen)} turns ${citizen.age} today.`, actors: [citizen.citizen_id], priority: 2,
    memories: [{ citizen_id: citizen.citizen_id, content: `Today is my ${citizen.age}th birthday!${citizen.age >= 3 ? " There is a party this evening." : ""}`, importance: 0.8 },
      ...guests.map((id) => ({ citizen_id: id, content: `It is ${citizen.name}'s birthday today; they turned ${citizen.age}.${citizen.age >= 3 ? ` I'm invited to ${first(citizen)}'s party.` : ""}`, importance: 0.55, related_citizen_id: citizen.citizen_id }))] });
}

function spreadIllness(city: CityState, sink: LifeSink) {
  const day = city.clock.day;
  const contagious = city.citizens.filter((c) => c.life?.conditions.some((x) => x.contagious));
  for (const citizen of city.citizens) {
    const life = citizen.life;
    if (!life || life.conditions.some((c) => !c.chronic)) continue;
    const exposed = contagious.find((sick) => sick !== citizen && (sick.life!.household_id === life.household_id
      || (sick.profession === "Student" && citizen.profession === "Student")
      || (sick.life!.job && sick.life!.job.location_id === life.job?.location_id)));
    const season = city.weather?.season === "winter" ? 2 : city.weather?.season === "summer" ? 0.7 : 1;
    const risk = (0.005 + citizen.stress * 0.00012) * season + (life.fitness < 30 ? 0.006 : 0) + (citizen.age >= 65 || citizen.age < 5 ? 0.006 : 0) + (exposed ? 0.09 : 0);
    const r = roll(day, citizen.citizen_id, "illness");
    if (r >= risk) continue;
    const kind: ConditionKind = exposed ? (exposed.life!.conditions.find((c) => c.contagious)!.name as ConditionKind) : r < risk * 0.6 ? "cold" : r < risk * 0.85 ? "flu" : "stomach bug";
    if (!catchCondition(citizen, kind, day)) continue;
    const label = kind === "flu" ? "the flu" : `a ${kind}`;
    sink({ kind: "illness", icon: "🤒", headline: `${citizen.name} woke up with ${label}${exposed ? `, probably caught from ${exposed.name}` : ""}.`, actors: [citizen.citizen_id], priority: 1,
      memories: [{ citizen_id: citizen.citizen_id, content: `I woke up feeling awful: I think I have ${label}.`, importance: 0.55, related_citizen_id: exposed?.citizen_id ?? null }] });
  }
}

function mortality(city: CityState, citizen: CitizenAgent, sink: LifeSink, factory: LifeFactory) {
  const life = citizen.life!;
  const day = city.clock.day;
  // Design choice for a young audience: children and teenagers can become seriously ill, but do not die.
  if (citizen.age < 18) {
    citizen.health = Math.max(citizen.health, 12);
    return;
  }
  const chronic = life.conditions.find((c) => c.chronic && c.severity >= 70);
  // Real-world yearly mortality (about 2% at 70, 6% at 80, 15% at 90), spread across the days of a year.
  // Serious illness and very poor health raise it sharply.
  let risk = citizen.age >= 50 ? (0.022 * Math.exp(0.095 * (citizen.age - 70))) / DAYS_PER_YEAR : 0;
  if (citizen.health < 25) risk += 0.004;
  if (citizen.health < 10) risk += 0.04;
  if (chronic) risk += (chronic.severity - 65) * 0.0004;
  if (chronic && chronic.severity >= 80 && roll(day, citizen.citizen_id, "episode") < 0.25) {
    citizen.health = clamp(citizen.health - 25);
    life.emotions.fear = clamp(life.emotions.fear + 40);
    sink({ kind: "emergency", icon: "🚑", headline: `${citizen.name} had a frightening ${chronic.name} episode and needs a doctor.`, actors: [citizen.citizen_id, ...relatives(city, citizen)], priority: 3,
      memories: relatives(city, citizen).map((id) => ({ citizen_id: id, content: `${citizen.name} had a scary health episode today. I'm really worried.`, importance: 0.8, related_citizen_id: citizen.citizen_id })) });
  }
  if (roll(day, citizen.citizen_id, "mortality") >= risk) return;
  passAway(city, citizen, chronic ? `complications of a ${chronic.name}` : citizen.age >= 75 ? "old age" : "a sudden illness", sink, factory);
}

export function passAway(city: CityState, citizen: CitizenAgent, cause: string, sink: LifeSink, factory: LifeFactory) {
  const day = city.clock.day;
  const kin = relatives(city, citizen);
  city.citizens = city.citizens.filter((c) => c !== citizen);
  factory.departed({ ...citizen, died_day: day, cause });
  if (city.policy.player_citizen_id === citizen.citizen_id) city.policy.player_citizen_id = null;
  if (city.encounter && [city.encounter.actor_id, city.encounter.target_id].includes(citizen.citizen_id)) city.encounter = null;
  const mourners: string[] = [];
  for (const other of city.citizens) {
    const o = other.life;
    if (!o) continue;
    const family = kin.includes(other.citizen_id);
    if (!family && roll(other.citizen_id, citizen.citizen_id, "knew") > 0.6) continue;
    mourners.push(other.citizen_id);
    o.emotions.sadness = clamp(o.emotions.sadness + (family ? 70 : 30));
    other.happiness = clamp(other.happiness - (family ? 25 : 8));
    other.mood = family ? "Grieving" : "Sad";
    if (o.partner_id === citizen.citizen_id) { o.relationship_status = "widowed"; o.partner_id = null; }
    o.parent_ids = o.parent_ids.filter((id) => id !== citizen.citizen_id);
    o.children_ids = o.children_ids.filter((id) => id !== citizen.citizen_id);
  }
  const funeral: Gathering = { id: `memorial-${citizen.citizen_id}`, kind: "funeral", title: `Memorial for ${citizen.name}`, host_ids: kin.filter((id) => city.citizens.some((c) => c.citizen_id === id)),
    guest_ids: mourners, location_id: "loc_park", day: day + 2, start: 660, end: 780 };
  city.gatherings = [...(city.gatherings ?? []), funeral];
  sink({ kind: "death", icon: "🕊️", headline: `${citizen.name} passed away peacefully at ${citizen.age} (${cause}). A memorial will be held in the park in two days.`, actors: [citizen.citizen_id, ...kin], priority: 3,
    memories: mourners.map((id) => {
      const mourner = city.citizens.find((c) => c.citizen_id === id)!;
      const relation = relationName(city, mourner, citizen);
      return { citizen_id: id, content: relation
        ? `My ${relation} ${citizen.name} died today. I miss them so much and it doesn't feel real yet.`
        : `${citizen.name} died today. I keep thinking about the last time I saw them.`, importance: relation ? 0.98 : 0.75, related_citizen_id: null };
    }) });
}

function conception(city: CityState, sink: LifeSink) {
  const day = city.clock.day;
  for (const citizen of city.citizens) {
    const life = citizen.life;
    if (!life || life.sex !== "female" || citizen.age < 20 || citizen.age > 44 || life.pregnancy || !life.wants_children) continue;
    if (!["partnered", "married"].includes(life.relationship_status) || !life.partner_id) continue;
    const partner = city.citizens.find((c) => c.citizen_id === life.partner_id);
    if (!partner?.life?.wants_children || partner.life.household_id !== life.household_id) continue;
    const youngest = Math.max(-Infinity, ...life.children_ids.map((id) => city.citizens.find((c) => c.citizen_id === id)?.life?.birth_day ?? -Infinity));
    if (day - youngest < DAYS_PER_YEAR) continue;
    if (roll(day, citizen.citizen_id, "baby") >= 0.004) continue;
    life.pregnancy = { partner_id: partner.citizen_id, due_day: day + PREGNANCY_DAYS };
    for (const parent of [citizen, partner]) parent.life!.emotions.joy = clamp(parent.life!.emotions.joy + 45);
    sink({ kind: "expecting", icon: "🤰", headline: `${citizen.name} and ${partner.name} are expecting a baby!`, actors: [citizen.citizen_id, partner.citizen_id], priority: 2,
      memories: [citizen, partner].map((p) => ({ citizen_id: p.citizen_id, content: "We found out we are going to have a baby! I'm excited and a little nervous.", importance: 0.95, related_citizen_id: p === citizen ? partner.citizen_id : citizen.citizen_id })) });
  }
}

const babyNames = { female: ["Lily", "Nora", "Maya", "Amara", "Rosa", "Mei", "Leila", "Clara"], male: ["Sam", "Arlo", "Kai", "Omar", "Felix", "Ravi", "Jonah", "Theo"] };

export function giveBirth(city: CityState, mother: CitizenAgent, sink: LifeSink, factory: LifeFactory) {
  const life = mother.life!;
  const day = city.clock.day;
  const partner = city.citizens.find((c) => c.citizen_id === life.pregnancy?.partner_id);
  life.pregnancy = null;
  const sex = roll(day, mother.citizen_id, "sex") < 0.5 ? "female" : "male";
  const taken = new Set(city.citizens.map((c) => first(c)));
  const name = babyNames[sex].find((n, i) => !taken.has(n) && roll(day, mother.citizen_id, n) < 0.5 + i * 0.1) ?? babyNames[sex].find((n) => !taken.has(n)) ?? "Robin";
  const surname = (partner ?? mother).name.split(" ").slice(1).join(" ");
  const id = `cit_b${day}_${mother.citizen_id.slice(-3)}`;
  const hospital = city.locations.find((l) => l.location_id === "loc_hospital");
  const [x, y] = hospital ? [hospital.x + Math.floor(hospital.width / 2), hospital.y + Math.floor(hospital.height / 2)] : [mother.x, mother.y];
  const parents = [mother, ...(partner ? [partner] : [])];
  const look = (parents.map((p) => p.personality.appearance).filter(Boolean) as Array<Record<string, string>>);
  const baby: CitizenAgent = {
    citizen_id: id, name: `${name} ${surname}`.trim(), age: 0, profession: "Baby", home_location_id: mother.home_location_id, work_location_id: null,
    current_location_id: "loc_hospital", x, y, target_x: x, target_y: y, money: 0, health: 95, hunger: 20, energy: 70, stress: 5, happiness: 80, reputation: 50,
    family_ids: parents.map((p) => p.citizen_id), friend_ids: [], relationship_scores: Object.fromEntries(parents.map((p) => [p.citizen_id, 90])), skills: [],
    personality: { nature: { traits: ["Sleepy", "Curious"], values: "Milk, naps and being held.", voice: "Babbles, coos and giggles.", sensitivity: "Loud noises and being hungry.", repair: "Calms down when cuddled." },
      appearance: look.length ? { skin: look[0].skin, hair: (look[1] ?? look[0]).hair, shirt: "#f4e3a4", background: "#fbf1d0" } : undefined },
    daily_schedule: [], short_term_goals: ["Sleep", "Eat", "Be cuddled"], long_term_goals: ["Grow up"], current_activity: "Sleeping in the hospital nursery",
    current_thought: "Warm. Sleepy.", memory_summary: `I was born in Nakameguro on day ${day}.`, mood: "Sleepy",
    life: { birth_day: day, sex, height_cm: round(48 + roll(day, id, "h") * 5), weight_kg: round(2.9 + roll(day, id, "w") * 1.0, 2), fitness: 50, emotions: { joy: 50, sadness: 5, anger: 5, fear: 5 },
      loneliness: 5, household_id: life.household_id, parent_ids: parents.map((p) => p.citizen_id), partner_id: null, children_ids: [], relationship_status: "single",
      job: null, ambition: null, conditions: [], pregnancy: null },
  };
  for (const parent of parents) {
    parent.life!.children_ids = [...parent.life!.children_ids, id];
    parent.life!.emotions.joy = clamp(parent.life!.emotions.joy + 60);
    parent.happiness = clamp(parent.happiness + 20);
    parent.mood = "Overjoyed";
  }
  mother.energy = clamp(mother.energy - 40);
  factory.newCitizen(baby);
  const kin = relatives(city, mother);
  sink({ kind: "birth", icon: "👶", headline: `Welcome to the world, ${baby.name}! Born at Kyosai Hospital to ${parents.map((p) => p.name).join(" and ")}.`, actors: [id, ...parents.map((p) => p.citizen_id)], priority: 3, location_id: "loc_hospital",
    memories: [...parents.map((p) => ({ citizen_id: p.citizen_id, content: `Our baby ${baby.name} was born today. I have never felt so happy and so tired.`, importance: 1, related_citizen_id: id })),
      ...kin.filter((k) => !parents.some((p) => p.citizen_id === k)).map((k) => ({ citizen_id: k, content: `${baby.name} was born today. Our family just got bigger!`, importance: 0.85, related_citizen_id: id }))] });
}

function romance(city: CityState, sink: LifeSink, bond: BondLookup) {
  const day = city.clock.day;
  const adults = city.citizens.filter((c) => isAdult(c) && c.life);
  for (const a of adults) for (const b of adults) {
    if (a.citizen_id >= b.citizen_id) continue;
    const la = a.life!, lb = b.life!;
    if (relatives(city, a).includes(b.citizen_id)) continue;
    if (Math.abs(a.age - b.age) > 15) continue;
    const ab = bond(a.citizen_id, b.citizen_id), ba = bond(b.citizen_id, a.citizen_id);
    if (!ab || !ba) continue;
    const mutual = Math.min(ab.warmth, ba.warmth), trust = Math.min(ab.trust, ba.trust);
    const single = (l: LifeState) => ["single", "widowed"].includes(l.relationship_status) && !l.partner_id;
    if (single(la) && single(lb) && mutual >= 66 && trust >= 60 && Math.min(ab.familiarity, ba.familiarity) >= 40) {
      for (const [l, other] of [[la, b], [lb, a]] as const) { l.relationship_status = "dating"; l.partner_id = other.citizen_id; l.dating_since = day; l.emotions.joy = clamp(l.emotions.joy + 35); }
      sink({ kind: "dating", icon: "💕", headline: `${a.name} and ${b.name} have started dating.`, actors: [a.citizen_id, b.citizen_id], priority: 2,
        memories: [a, b].map((p) => ({ citizen_id: p.citizen_id, content: `${first(p === a ? b : a)} and I decided to start dating. I feel lucky.`, importance: 0.9, related_citizen_id: (p === a ? b : a).citizen_id })) });
    } else if (la.partner_id === b.citizen_id && la.relationship_status === "dating" && day - (la.dating_since ?? day) >= 14 && mutual >= 78
      && !(city.gatherings ?? []).some((g) => g.kind === "wedding" && g.host_ids.includes(a.citizen_id)) && roll(day, a.citizen_id, b.citizen_id, "propose") < 0.05) {
      const saturday = day + ((6 - (((day - 1) % 7) + 1) + 7) % 7 || 7);
      city.gatherings = [...(city.gatherings ?? []), { id: `wedding-${a.citizen_id}-${b.citizen_id}`, kind: "wedding", title: `${first(a)} & ${first(b)}'s wedding`,
        host_ids: [a.citizen_id, b.citizen_id], guest_ids: [...new Set([...relatives(city, a), ...relatives(city, b)])], location_id: "loc_park", day: saturday + 7, start: 840, end: 1020 }];
      sink({ kind: "engaged", icon: "💍", headline: `${a.name} and ${b.name} are engaged! The wedding is in the park on day ${saturday + 7}.`, actors: [a.citizen_id, b.citizen_id], priority: 2,
        memories: [a, b].map((p) => ({ citizen_id: p.citizen_id, content: `We got engaged! I'm going to marry ${(p === a ? b : a).name}.`, importance: 0.95, related_citizen_id: (p === a ? b : a).citizen_id })) });
    } else if (la.partner_id === b.citizen_id && la.relationship_status === "dating" && Math.max(ab.warmth, ba.warmth) < 35) {
      for (const l of [la, lb]) { l.relationship_status = "single"; l.partner_id = null; l.emotions.sadness = clamp(l.emotions.sadness + 30); }
      sink({ kind: "breakup", icon: "💔", headline: `${a.name} and ${b.name} have broken up.`, actors: [a.citizen_id, b.citizen_id], priority: 2,
        memories: [a, b].map((p) => ({ citizen_id: p.citizen_id, content: `${first(p === a ? b : a)} and I broke up. It hurts.`, importance: 0.85, related_citizen_id: (p === a ? b : a).citizen_id })) });
    }
  }
}

function weddings(city: CityState, sink: LifeSink) {
  const day = city.clock.day;
  for (const wedding of (city.gatherings ?? []).filter((g) => g.kind === "wedding" && g.day === day)) {
    const [a, b] = wedding.host_ids.map((id) => city.citizens.find((c) => c.citizen_id === id));
    if (!a?.life || !b?.life || a.life.partner_id !== b.citizen_id) continue;
    // The smaller household moves in with the larger one, bringing any children.
    const size = (h: string) => city.citizens.filter((c) => c.life?.household_id === h).length;
    const [stay, move] = size(a.life.household_id) >= size(b.life.household_id) ? [a, b] : [b, a];
    const oldHome = move.life!.household_id;
    for (const c of city.citizens) if (c.life?.household_id === oldHome && (c === move || move.life!.children_ids.includes(c.citizen_id))) c.life.household_id = stay.life!.household_id;
    for (const [l, other] of [[a.life, b], [b.life, a]] as const) { l.relationship_status = "married"; l.partner_id = other.citizen_id; l.wants_children ??= true; l.emotions.joy = clamp(l.emotions.joy + 60); }
    sink({ kind: "wedding", icon: "💒", headline: `${a.name} and ${b.name} got married in the park today! ${first(move)} is moving in with ${first(stay)}.`, actors: [a.citizen_id, b.citizen_id, ...wedding.guest_ids], priority: 3, location_id: "loc_park",
      memories: [a, b].map((p) => ({ citizen_id: p.citizen_id, content: `Today I married ${(p === a ? b : a).name}. Best day of my life.`, importance: 1, related_citizen_id: (p === a ? b : a).citizen_id })) });
  }
}

const HOUSE_RENT = 400, PER_PERSON = 80, PENSION = 260, ALLOWANCE = 15;
function weeklyMoney(city: CityState, sink: LifeSink) {
  const households = new Map<string, CitizenAgent[]>();
  for (const c of city.citizens) if (c.life) households.set(c.life.household_id, [...(households.get(c.life.household_id) ?? []), c]);
  for (const c of city.citizens) if (c.age >= 65 && !c.life?.job) c.money = round(c.money + PENSION, 2);
  for (const [, members] of households) {
    const payers = members.filter((m) => isAdult(m));
    const bill = HOUSE_RENT + PER_PERSON * members.length;
    for (const payer of payers) {
      payer.money = round(payer.money - bill / payers.length, 2);
      if (payer.money < 100) {
        payer.stress = clamp(payer.stress + 18);
        payer.life!.emotions.fear = clamp(payer.life!.emotions.fear + 20);
        sink({ kind: "money_worry", icon: "💸", headline: `${payer.name} is worried about paying this week's bills.`, actors: [payer.citizen_id], priority: 1,
          memories: [{ citizen_id: payer.citizen_id, content: "After rent and groceries there's almost nothing left this week. I'm worried about money.", importance: 0.7 }] });
      }
    }
    for (const kid of members.filter((m) => m.age >= 6 && m.age < 18)) {
      const parent = payers.find((p) => kid.life?.parent_ids.includes(p.citizen_id)) ?? payers[0];
      if (!parent || parent.money < ALLOWANCE + 40) continue;
      parent.money = round(parent.money - ALLOWANCE, 2);
      kid.money = round(kid.money + ALLOWANCE, 2);
    }
  }
  sink({ kind: "payday", icon: "🗓️", headline: `A new week in Nakameguro: rent and groceries paid, and pocket money handed out.`, actors: [], priority: 1 });
}

const letter = (grade: number) => grade >= 90 ? "A" : grade >= 80 ? "B" : grade >= 70 ? "C" : grade >= 60 ? "D" : "E";
export const gradeLetter = letter;
function reportCards(city: CityState, sink: LifeSink) {
  const students = city.citizens.filter((c) => c.life?.grade !== undefined && c.profession === "Student");
  if (!students.length) return;
  for (const s of students) {
    const g = s.life!.grade!;
    s.life!.emotions[g >= 80 ? "joy" : "fear"] = clamp(s.life!.emotions[g >= 80 ? "joy" : "fear"] + 20);
  }
  sink({ kind: "report_cards", icon: "📝", headline: `Weekly report cards: ${students.map((s) => `${first(s)} ${letter(s.life!.grade!)}`).join(", ")}.`, actors: students.map((s) => s.citizen_id), priority: 1,
    memories: students.map((s) => ({ citizen_id: s.citizen_id, content: `My report card this week says ${letter(s.life!.grade!)}. ${s.life!.grade! >= 80 ? "I'm proud of that." : "I know I can do better."}`, importance: 0.55 })) });
}

function ambitions(city: CityState, citizen: CitizenAgent, sink: LifeSink, bond: BondLookup) {
  const life = citizen.life;
  const ambition = life?.ambition;
  if (!life || !ambition || ambition.achieved_day) return;
  const today = life.today ?? zeroToday();
  const friends = city.citizens.filter((o) => o !== citizen && (bond(citizen.citizen_id, o.citizen_id)?.warmth ?? 0) >= 60).length;
  const next = {
    study: ambition.progress + today.study * 0.04 + today.hobby * 0.03,
    fitness: ambition.progress + today.workout * 0.25,
    money: ambition.target ? (citizen.money / ambition.target) * 100 : ambition.progress,
    career: ambition.progress + today.work * 0.025,
    creative: ambition.progress + today.hobby * 0.1,
    social: friends * 20,
    family: life.children_ids.some((id) => (city.citizens.find((c) => c.citizen_id === id)?.life?.birth_day ?? -1) > 1) ? 100 : life.pregnancy ? 60 : ambition.progress,
  }[ambition.kind];
  ambition.progress = round(clamp(next));
  if (ambition.progress < 100) return;
  ambition.achieved_day = city.clock.day;
  life.emotions.joy = clamp(life.emotions.joy + 50);
  let extra = "";
  if (ambition.kind === "career" && life.job) {
    life.job = { ...life.job, hourly_wage: round(life.job.hourly_wage * 1.15, 2), title: life.job.title.startsWith("Senior") ? life.job.title : `Senior ${life.job.title.charAt(0).toLowerCase()}${life.job.title.slice(1)}` };
    extra = ` ${first(citizen)} was promoted to ${life.job.title}.`;
  }
  sink({ kind: "ambition", icon: "🌟", headline: `Dream achieved: ${citizen.name} did it: "${ambition.goal}".${extra}`, actors: [citizen.citizen_id], priority: 2,
    memories: [{ citizen_id: citizen.citizen_id, content: `I achieved something I have wanted for a long time: ${ambition.goal}.`, importance: 0.95 }] });
}

/** Moves every date in a profile-seeded life by `days`, for residents joining a world already in progress. */
export function shiftLife(life: LifeState, days: number) {
  life.birth_day += days;
  if (life.pregnancy) life.pregnancy.due_day += days;
  for (const c of life.conditions) {
    c.since_day += days;
    if (c.treated_until !== undefined) c.treated_until += days;
  }
  return life;
}

export function gatheringFor(city: CityState, citizen: CitizenAgent) {
  const { day, minute_of_day: minute } = city.clock;
  return (city.gatherings ?? []).find((g) => g.day === day && minute >= g.start - 30 && minute < g.end
    && (g.host_ids.includes(citizen.citizen_id) || g.guest_ids.includes(citizen.citizen_id)));
}

/** Babies go wherever a parent who is not at work goes. */
export function caregiverFor(city: CityState, baby: CitizenAgent) {
  const parents = (baby.life?.parent_ids ?? []).map((id) => city.citizens.find((c) => c.citizen_id === id)).filter((c) => c !== undefined);
  const household = city.citizens.filter((c) => c !== baby && c.age >= 18 && c.life?.household_id === baby.life?.household_id);
  const candidates = [...parents, ...household];
  return candidates.find((c) => !/^Working/.test(c.current_activity)) ?? candidates[0];
}
