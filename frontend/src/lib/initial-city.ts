import type { CitizenAgent, CityState, Location } from "@/lib/types";

const STUDENT_SCHEDULE = [
  { start: 360, end: 450, activity: "Breakfast and commute", location_id: "loc_homes" },
  { start: 450, end: 900, activity: "Attend school", location_id: "loc_school" },
  { start: 900, end: 1020, activity: "Social time at park", location_id: "loc_park" },
  { start: 1020, end: 1260, activity: "Homework and dinner", location_id: "loc_homes" },
  { start: 1260, end: 1440, activity: "Sleep", location_id: "loc_homes" },
];

const locations: Location[] = [
  location("loc_homes", "Homes", "home", 2, 2, 8, 7, 30, ["rest", "sleep", "family"]),
  location("loc_hospital", "Hospital", "hospital", 28, 3, 6, 5, 12, ["diagnose", "treat"]),
  location("loc_school", "School", "school", 15, 4, 7, 5, 20, ["teach", "exam"]),
  location("loc_bank", "Bank", "bank", 6, 14, 5, 4, 8, ["deposit", "loan"]),
  location("loc_market", "Market", "market", 18, 15, 6, 5, 18, ["food", "medicine", "goods"]),
  location("loc_restaurant", "Restaurant", "restaurant", 3, 19, 6, 4, 16, ["meal", "socialize"]),
  location("loc_pharmacy", "Pharmacy", "pharmacy", 29, 9, 5, 4, 10, ["medicine", "care"]),
  location("loc_farm", "Farm", "farm", 3, 28, 9, 7, 8, ["grow_food", "sell_produce"]),
  location("loc_police", "Police Station", "police", 30, 14, 5, 4, 8, ["respond", "investigate"]),
  location("loc_city_hall", "City Hall", "city_hall", 28, 26, 6, 5, 12, ["policy", "budget"]),
  location("loc_lab", "Research Lab", "lab", 34, 20, 5, 5, 10, ["research", "analysis"]),
  location("loc_library", "Library", "library", 18, 22, 5, 4, 14, ["study", "community"]),
  location("loc_power", "Power Station", "power", 34, 33, 4, 4, 6, ["power", "repairs"]),
  location("loc_park", "Park", "park", 16, 28, 8, 6, 30, ["rest", "socialize"]),
  location("loc_bus_stop", "Bus Stop", "bus_stop", 13, 13, 3, 3, 12, ["transport"]),
];

const citizens: CitizenAgent[] = [
  student({
    citizen_id: "cit_009",
    name: "Ava Singh",
    age: 13,
    position: [3, 3],
    money: 186,
    health: 90,
    hunger: 35,
    energy: 80,
    stress: 24,
    happiness: 72,
    reputation: 56,
    skills: ["science", "debate"],
    mood: "Curious",
    personality: { openness: 82, conscientiousness: 68, warmth: 74, risk_tolerance: 42 },
    current_thought: "I want to understand what my friends are really worried about today.",
    short_term_goals: ["Ask one friend how they are doing", "Finish the science worksheet"],
    memory_summary:
      "Ava Singh is one of five active student agents in Navora. Her friendships, school stress, private goals, and conversations are the focus of this MVP.",
    friend_ids: ["cit_010", "cit_021"],
    relationship_score: 42,
  }),
  student({
    citizen_id: "cit_010",
    name: "Mateo Garcia",
    age: 14,
    position: [5, 3],
    money: 137,
    health: 83,
    hunger: 29,
    energy: 73,
    stress: 17,
    happiness: 66,
    reputation: 49,
    skills: ["math", "music"],
    mood: "Playful",
    personality: { openness: 78, conscientiousness: 55, warmth: 70, risk_tolerance: 58 },
    current_thought: "Maybe I can turn today's school drama into a song idea.",
    short_term_goals: ["Practice music at the park", "Help someone with math homework"],
    memory_summary:
      "Mateo Garcia is one of five active student agents in Navora. His friendships, jokes, music ideas, and conversations are the focus of this MVP.",
    friend_ids: ["cit_009", "cit_021"],
    relationship_score: 43,
  }),
  student({
    citizen_id: "cit_021",
    name: "Noah Mensah",
    age: 12,
    position: [7, 4],
    money: 130,
    health: 84,
    hunger: 35,
    energy: 74,
    stress: 24,
    happiness: 66,
    reputation: 68,
    skills: ["biology", "sports"],
    mood: "Energetic",
    personality: { openness: 65, conscientiousness: 60, warmth: 73, risk_tolerance: 67 },
    current_thought: "I want to get through class and still have energy for the park.",
    short_term_goals: ["Check on Leo after class", "Organize a small game at the park"],
    memory_summary:
      "Noah Mensah is one of five active student agents in Navora. His friendships, sports energy, school stress, and conversations are the focus of this MVP.",
    friend_ids: ["cit_009", "cit_010"],
    relationship_score: 44,
  }),
  student({
    citizen_id: "cit_022",
    name: "Iris Novak",
    age: 15,
    position: [4, 6],
    money: 151,
    health: 85,
    hunger: 35,
    energy: 75,
    stress: 24,
    happiness: 67,
    reputation: 51,
    skills: ["writing", "chemistry"],
    mood: "Observant",
    personality: { openness: 88, conscientiousness: 71, warmth: 62, risk_tolerance: 33 },
    current_thought: "There is a story in how everyone is reacting today. I should pay attention.",
    short_term_goals: ["Write down one meaningful conversation", "Study chemistry at the library"],
    memory_summary:
      "Iris Novak is one of five active student agents in Navora. Her observations, writing, school stress, and conversations are the focus of this MVP.",
    friend_ids: ["cit_009", "cit_010"],
    relationship_score: 45,
  }),
  student({
    citizen_id: "cit_026",
    name: "Leo Brooks",
    age: 13,
    position: [8, 7],
    money: 165,
    health: 89,
    hunger: 35,
    energy: 79,
    stress: 24,
    happiness: 71,
    reputation: 55,
    skills: ["robotics", "sketching"],
    mood: "Thoughtful",
    personality: { openness: 76, conscientiousness: 66, warmth: 64, risk_tolerance: 38 },
    current_thought: "I'm new to the group, so I should find a natural way to join the conversation.",
    short_term_goals: ["Make one real friend", "Show someone my robot sketch"],
    memory_summary:
      "Leo Brooks is one of five active student agents in Navora. His newness, robot sketches, private worries, and conversations are the focus of this MVP.",
    friend_ids: ["cit_009", "cit_010"],
    relationship_score: 46,
  }),
];

export function createInitialCity(): CityState {
  return structuredClone({
    city_id: "navora",
    city_name: "Navora",
    map_width: 40,
    map_height: 40,
    simulation_mode: "manual",
    clock: {
      day: 1,
      minute_of_day: 360,
      tick: 0,
      running: false,
    },
    policy: {
      tax_rate: 0.12,
      hospital_budget: 55,
      school_budget: 52,
      road_budget: 48,
      farmer_subsidy: 35,
      public_health_campaign: false,
      simulation_mode: "manual",
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
    open_hours: { start: 420, end: 1080 },
    services,
    inventory: { food: 80, medicine: 35, cash: 5000 },
    workers: [],
    visitors: [],
  };
}

function student(input: {
  citizen_id: string;
  name: string;
  age: number;
  position: [number, number];
  money: number;
  health: number;
  hunger: number;
  energy: number;
  stress: number;
  happiness: number;
  reputation: number;
  skills: string[];
  mood: string;
  personality: Record<string, number>;
  current_thought: string;
  short_term_goals: string[];
  memory_summary: string;
  friend_ids: string[];
  relationship_score: number;
}): CitizenAgent {
  const relationship_scores = Object.fromEntries(
    ["cit_009", "cit_010", "cit_021", "cit_022", "cit_026"]
      .filter((citizenId) => citizenId !== input.citizen_id)
      .map((citizenId) => [citizenId, input.relationship_score]),
  );
  return {
    citizen_id: input.citizen_id,
    name: input.name,
    age: input.age,
    profession: "Student",
    home_location_id: "loc_homes",
    work_location_id: "loc_school",
    current_location_id: "loc_homes",
    x: input.position[0],
    y: input.position[1],
    target_x: input.position[0],
    target_y: input.position[1],
    money: input.money,
    health: input.health,
    hunger: input.hunger,
    energy: input.energy,
    stress: input.stress,
    happiness: input.happiness,
    reputation: input.reputation,
    family_ids: [],
    friend_ids: input.friend_ids,
    relationship_scores,
    skills: input.skills,
    personality: { playable: true, student_arc: true, ...input.personality },
    daily_schedule: STUDENT_SCHEDULE,
    short_term_goals: input.short_term_goals,
    long_term_goals: ["Build a real friendship circle in Navora", "Become more confident at school"],
    current_activity: "Waking up at home",
    current_thought: input.current_thought,
    memory_summary: input.memory_summary,
    mood: input.mood,
  };
}
