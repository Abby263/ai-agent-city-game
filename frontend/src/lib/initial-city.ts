import profiles from "./generated/citizens.json";
import type { CitizenAgent, CityState, LifeState, Location } from "./types";
import { DAYS_PER_YEAR, typicalBody } from "./life";
import { calendarStartFor } from "./calendar";
import { weatherAt } from "./weather";

const locations: Location[] = [
  location("loc_homes", "Aobadai Homes", "home", 2, 2, 8, 7, 30, [
    "rest",
    "sleep",
    "family",
  ]),
  location("loc_hospital", "Kyosai Hospital", "hospital", 28, 3, 6, 5, 12, [
    "diagnose",
    "treat",
  ]),
  location("loc_school", "Nakameguro School", "school", 15, 4, 7, 5, 20, [
    "teach",
    "exam",
  ]),
  location("loc_bank", "Aobadai Bank", "bank", 6, 14, 5, 4, 8, ["deposit", "loan"]),
  location("loc_market", "Meguro Ginza Market", "market", 18, 15, 6, 5, 18, [
    "food",
    "medicine",
    "goods",
  ]),
  location("loc_restaurant", "Sunny Side Cafe", "restaurant", 3, 19, 6, 4, 16, [
    "meal",
    "socialize",
  ]),
  location("loc_pharmacy", "Riverside Pharmacy", "pharmacy", 29, 9, 5, 4, 10, [
    "medicine",
    "care",
  ]),
  location("loc_farm", "Meguro Community Garden", "farm", 3, 28, 9, 7, 8, [
    "grow_food",
    "sell_produce",
  ]),
  location("loc_police", "Nakameguro Koban", "police", 30, 14, 5, 4, 8, [
    "respond",
    "investigate",
  ]),
  location("loc_city_hall", "Meguro City Office", "city_hall", 28, 26, 6, 5, 12, [
    "policy",
    "budget",
  ]),
  location("loc_lab", "Meguro Science Lab", "lab", 34, 20, 5, 5, 10, [
    "research",
    "analysis",
  ]),
  location("loc_library", "Nakameguro Library", "library", 18, 22, 5, 4, 14, [
    "study",
    "community",
  ]),
  location("loc_power", "Power Substation", "power", 34, 33, 4, 4, 6, [
    "power",
    "repairs",
  ]),
  location("loc_park", "Saigoyama Park", "park", 16, 28, 8, 6, 30, ["rest", "socialize"]),
  location("loc_bus_stop", "Aobadai Bus Stop", "bus_stop", 13, 13, 3, 3, 12, [
    "transport",
  ]),
  location("loc_gym", "Riverside Gym", "gym", 35, 17, 4, 3, 16, [
    "fitness",
    "classes",
  ]),
  // Downtown across the river, around Nakameguro Station.
  location("loc_apartments", "Kamimeguro Apartments", "home", 52, 3, 6, 5, 40, ["rest", "sleep", "family"]),
  location("loc_office", "Nakameguro GT Tower", "office", 72, 3, 5, 5, 60, ["work", "meetings"]),
  location("loc_mall", "Kokashita Arcade", "mall", 55, 17, 8, 5, 80, ["shopping", "food court", "cinema"]),
  location("loc_station", "Nakameguro Station", "station", 76, 17, 6, 5, 120, ["trains", "buses"]),
  location("loc_konbini", "HappyMart 24", "konbini", 62, 29, 4, 3, 10, ["snacks", "open 24 hours"]),
  location("loc_shrine", "Hikawa Shrine", "shrine", 54, 30, 6, 6, 30, ["prayer", "festivals"]),
  location("loc_clinic", "Minami Clinic", "clinic", 73, 30, 5, 4, 12, ["diagnose", "treat"]),
];

type ProfileLife = Partial<LifeState> & {
  birthday_in_days?: number;
  pregnancy?: { partner_id: string | null; due_in_days: number } | null;
};

/** Profiles describe dates relative to the first day, so a world can be seeded on any day. */
export function lifeFromProfile(profile: { citizen_id: string; age?: number; profession: string; life?: ProfileLife }, day: number): LifeState {
  const raw = profile.life ?? {};
  const age = profile.age ?? 18;
  const sex = raw.sex ?? "female";
  const shift = day - 1;
  return {
    birth_day: day + (raw.birthday_in_days ?? 180) - (age + 1) * DAYS_PER_YEAR,
    sex,
    ...typicalBody(age, sex),
    ...(raw.height_cm ? { height_cm: raw.height_cm } : {}),
    ...(raw.weight_kg ? { weight_kg: raw.weight_kg } : {}),
    fitness: raw.fitness ?? 55,
    emotions: { joy: 40, sadness: 8, anger: 5, fear: 8 },
    loneliness: raw.loneliness ?? 25,
    household_id: raw.household_id ?? "home_a",
    parent_ids: raw.parent_ids ?? [],
    family_roles: raw.family_roles,
    partner_id: raw.partner_id ?? null,
    children_ids: raw.children_ids ?? [],
    relationship_status: raw.relationship_status ?? "single",
    job: raw.job ?? null,
    grade: raw.grade ?? (profile.profession === "Student" ? 70 : undefined),
    ambition: raw.ambition ?? null,
    conditions: (raw.conditions ?? []).map((c) => ({ ...c, since_day: c.since_day + shift, treated_until: c.treated_until === undefined ? undefined : c.treated_until + shift })),
    pregnancy: raw.pregnancy ? { partner_id: raw.pregnancy.partner_id, due_day: day + raw.pregnancy.due_in_days } : null,
    wants_children: raw.wants_children ?? false,
    gym_days: raw.gym_days,
  };
}

type Profile = Omit<Partial<CitizenAgent>, "life"> & {
  citizen_id: string;
  name: string;
  profession: string;
  position: number[];
  life?: ProfileLife;
};

function citizenFromProfile(profile: Profile): CitizenAgent {
  const home = profile.home_location_id ?? "loc_homes";
  return {
    citizen_id: profile.citizen_id,
    name: profile.name,
    profession: profile.profession,
    age: profile.age ?? 18,
    home_location_id: home,
    work_location_id: profile.work_location_id ?? null,
    current_location_id: profile.current_location_id ?? home,
    x: profile.position[0],
    y: profile.position[1],
    target_x: profile.position[0],
    target_y: profile.position[1],
    money: profile.money ?? 120,
    health: profile.health ?? 90,
    hunger: profile.hunger ?? 20,
    energy: profile.energy ?? 80,
    stress: profile.stress ?? 20,
    happiness: profile.happiness ?? 70,
    reputation: profile.reputation ?? 50,
    family_ids: profile.family_ids ?? [],
    friend_ids: [],
    relationship_scores: profile.relationship_scores ?? {},
    skills: profile.skills ?? [],
    personality: profile.personality ?? {},
    daily_schedule: profile.daily_schedule ?? [
      {
        start: 360,
        end: 450,
        activity: "Breakfast at home",
        location_id: home,
      },
      {
        start: 450,
        end: 900,
        activity:
          profile.profession === "Student" ? "Attend school" : "At work",
        location_id: profile.work_location_id ?? home,
      },
      {
        start: 900,
        end: 1020,
        activity: "Social time at park",
        location_id: "loc_park",
      },
      {
        start: 1020,
        end: 1260,
        activity: "Dinner and personal projects",
        location_id: home,
      },
      { start: 1260, end: 1440, activity: "Sleep", location_id: home },
    ],
    short_term_goals: profile.short_term_goals ?? [],
    long_term_goals: profile.long_term_goals ?? [],
    current_activity: profile.current_activity ?? "Waking up at home",
    current_thought: profile.current_thought ?? "A new day begins.",
    memory_summary:
      profile.memory_summary ?? `${profile.name} lives in Nakameguro.`,
    mood: profile.mood ?? "Calm",
    life: lifeFromProfile(profile, 1),
  };
}

export function createInitialCity(): CityState {
  const citizens = (profiles as unknown as Profile[]).map(citizenFromProfile);
  // Tests pin the calendar so holidays and weather are the same on every run.
  const calendarStart = (typeof process !== "undefined" && process.env.AGENTCITY_CALENDAR_START) || calendarStartFor(1);
  return structuredClone({
    calendar_start: calendarStart,
    weather: weatherAt(calendarStart, 1, 360),
    weather_override: null,
    city_id: "navora",
    city_name: "Nakameguro",
    revision: 0,
    map_width: 92,
    map_height: 40,
    simulation_mode: "manual",
    clock: { day: 1, minute_of_day: 360, tick: 0, running: false },
    policy: {
      tax_rate: 0.12,
      hospital_budget: 55,
      school_budget: 52,
      road_budget: 48,
      farmer_subsidy: 35,
      public_health_campaign: false,
      simulation_mode: "manual",
      // Real Tokyo time by default; tests use the classic fast clock.
      time_mode: (typeof process !== "undefined" && process.env.AGENTCITY_TIME_MODE) || "live",
    },
    metrics: {
      population: citizens.length,
      average_happiness: 68,
      city_health: 86,
      economy_status: 65,
      education_status: 70,
      traffic_status: 78,
      sick_count: 0,
      active_events: 0,
    },
    locations,
    citizens,
    departed: [],
    gatherings: [],
    life_log: [],
    events: [],
  } satisfies CityState);
}

function location(
  location_id: string,
  name: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  capacity: number,
  services: string[],
): Location {
  return {
    location_id,
    name,
    type,
    x,
    y,
    width,
    height,
    capacity,
    services,
    open_hours: { start: 420, end: 1080 },
    inventory: { food: 80, medicine: 35, cash: 5000 },
    workers: [],
    visitors: [],
  };
}
