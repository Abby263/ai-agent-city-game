export type Location = {
  location_id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  capacity: number;
  open_hours: Record<string, unknown>;
  services: string[];
  inventory: Record<string, unknown>;
  workers: string[];
  visitors: string[];
};

export type CitizenAgent = {
  citizen_id: string;
  name: string;
  age: number;
  profession: string;
  home_location_id: string;
  work_location_id: string | null;
  current_location_id: string;
  x: number;
  y: number;
  target_x: number;
  target_y: number;
  money: number;
  health: number;
  hunger: number;
  energy: number;
  stress: number;
  happiness: number;
  reputation: number;
  family_ids: string[];
  friend_ids: string[];
  relationship_scores: Record<string, number>;
  skills: string[];
  personality: Record<string, unknown>;
  daily_schedule: Array<Record<string, unknown>>;
  short_term_goals: string[];
  long_term_goals: string[];
  current_activity: string;
  current_thought: string;
  memory_summary: string;
  mood: string;
};

export type CityEvent = {
  event_id: string;
  timestamp: string;
  game_day: number;
  game_minute: number;
  event_type: string;
  location_id: string | null;
  actors: string[];
  description: string;
  payload: Record<string, unknown>;
  priority: number;
  visibility: string;
};

export type CityMetrics = {
  population: number;
  average_happiness: number;
  city_health: number;
  economy_status: number;
  education_status: number;
  traffic_status: number;
  sick_count: number;
  active_events: number;
};

export type SimulationClock = {
  day: number;
  minute_of_day: number;
  tick: number;
  running: boolean;
};

export type CityState = {
  city_id: string;
  city_name: string;
  map_width: number;
  map_height: number;
  clock: SimulationClock;
  policy: Record<string, unknown>;
  metrics: CityMetrics;
  locations: Location[];
  citizens: CitizenAgent[];
  events: CityEvent[];
};

export type Memory = {
  memory_id: string;
  citizen_id: string;
  kind: string;
  content: string;
  importance: number;
  salience: number;
  related_citizen_id: string | null;
  source_event_id: string | null;
  extra: Record<string, unknown>;
  created_at: string;
};

export type Relationship = {
  relationship_id: string;
  citizen_id: string;
  other_citizen_id: string;
  trust: number;
  warmth: number;
  familiarity: number;
  notes: string;
};

export type Conversation = {
  conversation_id: string;
  game_day: number;
  game_minute: number;
  location_id: string | null;
  actor_ids: string[];
  transcript: Array<{
    speaker_id: string;
    text: string;
  }>;
  summary: string;
};

export type TimelineItem = {
  id: string;
  type: string;
  time: string;
  text: string;
  priority?: number;
};

export type WebSocketEnvelope = {
  type: string;
  timestamp: string | null;
  payload: unknown;
};

export type TriggerEventPayload = {
  event_type:
    | "flu_outbreak"
    | "traffic_accident"
    | "food_shortage"
    | "school_exam"
    | "city_festival"
    | "bank_policy_change"
    | "power_outage";
  location_id?: string | null;
  severity?: "low" | "medium" | "high";
};

export type MayorPolicyPayload = {
  tax_rate?: number;
  hospital_budget?: number;
  school_budget?: number;
  road_budget?: number;
  farmer_subsidy?: number;
  public_health_campaign?: boolean;
};
