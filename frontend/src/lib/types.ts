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
  /** Body, family, work, health and feelings. Missing on very old saves until migrated. */
  life?: LifeState;
};

export type LifeStage = "baby" | "child" | "teen" | "adult" | "elder";
export type Emotions = { joy: number; sadness: number; anger: number; fear: number };
export type HealthCondition = {
  id: string;
  name: string;
  /** 0-100; the condition clears at 0. */
  severity: number;
  contagious: boolean;
  chronic: boolean;
  treated: boolean;
  since_day: number;
  /** For chronic conditions: medication lasts until this day. */
  treated_until?: number;
};
export type Job = {
  title: string;
  location_id: string;
  hourly_wage: number;
  start: number;
  end: number;
  /** 0 = Monday ... 6 = Sunday. */
  workdays: number[];
};
export type Ambition = {
  goal: string;
  kind: "study" | "fitness" | "money" | "career" | "creative" | "social" | "family";
  progress: number;
  /** Savings goal in dollars for money ambitions. */
  target?: number;
  achieved_day?: number;
};
export type LifeState = {
  /** City day on which this person was born; day 1 is the first day of the session. */
  birth_day: number;
  sex: "female" | "male";
  height_cm: number;
  weight_kg: number;
  fitness: number;
  emotions: Emotions;
  loneliness: number;
  household_id: string;
  parent_ids: string[];
  /** Explicit kinship for relatives whose parents are not in the city. */
  family_roles?: Record<string, string>;
  partner_id: string | null;
  children_ids: string[];
  relationship_status: "single" | "dating" | "partnered" | "married" | "widowed";
  job: Job | null;
  /** School performance for students, 0-100. */
  grade?: number;
  /** A student's usual level; grades drift toward it, and library study slowly raises it. */
  aptitude?: number;
  ambition: Ambition | null;
  conditions: HealthCondition[];
  pregnancy: { partner_id: string | null; due_day: number } | null;
  wants_children?: boolean;
  gym_days?: number[];
  /** The weight this body settles at; habits nudge it slowly, and it grows with children. */
  set_weight?: number;
  dating_since?: number;
  /** Counters for the current day, used for weight, fitness and ambitions. */
  today?: { meals: number; workout: number; work: number; study: number; hobby: number; social: number; last_meal_tick?: number };
};

export type DepartedCitizen = CitizenAgent & { died_day: number; cause: string };
export type Gathering = {
  id: string;
  kind: "birthday" | "funeral" | "wedding";
  title: string;
  host_ids: string[];
  guest_ids: string[];
  location_id: string;
  day: number;
  start: number;
  end: number;
};
export type LifeLogEntry = {
  id: string;
  day: number;
  minute: number;
  kind: string;
  icon: string;
  headline: string;
  actors: string[];
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
  /** YYYY-MM-DD of city day 1 (always a Monday). */
  calendar_start?: string;
  weather?: import("./weather").WeatherNow;
  weather_override?: import("./weather").WeatherOverride | null;
  /** Absolute city minute until which residents stay at the evacuation area after a strong earthquake. */
  evacuation_until?: number;
  /** Fires and accidents the player created; fires close the building until they end. */
  incidents?: import("./incidents").Incident[];
  /** Storylines the player set in motion, with every beat that followed. */
  stories?: import("./stories").Story[];
  departed?: DepartedCitizen[];
  gatherings?: Gathering[];
  life_log?: LifeLogEntry[];
  encounter?: import("./encounters").Encounter | null;
  meetings?: import("./encounters").SocialMeeting[];
  activities?: import("./elections").Election[];
  revision?: number;
  city_id: string;
  city_name: string;
  map_width: number;
  map_height: number;
  simulation_mode: SimulationMode;
  clock: SimulationClock;
  policy: Record<string, unknown>;
  metrics: CityMetrics;
  locations: Location[];
  citizens: CitizenAgent[];
  events: CityEvent[];
};

export type SimulationMode = "manual" | "autonomous";

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
  feelings?: Feelings;
  last_changed_at?: number;
  history?: Array<{
    day: number;
    minute: number;
    reason: string;
    effect: string;
    conversation_id?: string;
    changes?: Partial<BondSnapshot>;
    before?: BondSnapshot;
    after?: BondSnapshot;
    source?: "action" | "conversation";
    created_at?: string;
    assessment_status?: ConversationImpact["status"];
    feelings?: Feelings;
    mood?: string;
  }>;
};

export type Conversation = {
  encounter?: import("./encounters").EncounterContext;
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
  impacts?: ConversationImpact[];
  /** The player spoke in this exchange; it plays inline in Talk rather than as a cutscene. */
  player_chat?: boolean;
  /** What each person wants to do next because of this exchange; offered to the player as "what happens next". */
  intentions?: Record<string, string>;
};

export type BondSnapshot = Feelings & {
  trust: number;
  warmth: number;
  familiarity: number;
};

export type ConversationImpact = {
  citizen_id: string;
  other_citizen_id: string;
  before: BondSnapshot;
  after: BondSnapshot;
  action_after?: BondSnapshot;
  mood_before: string;
  mood_after: string;
  reason: string;
  status: "assessed" | "cooldown" | "repeated" | "not_assessed";
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

export type AssignTaskPayload = {
  task: string;
};

export type SessionCognitionRequest = {
  conversation_mode?: "task" | "autonomous";
  player_utterance?: string;
  /** Recent lines between the same two people, so an ongoing chat stays continuous. */
  prior_lines?: Array<{ speaker_id: string; text: string }>;
  city: CityState;
  actor_id: string;
  target_id?: string | null;
  required_target_id?: string | null;
  require_conversation?: boolean;
  task: string;
  observations: string[];
  memories: string[];
  private_memories?: Record<string, string[]>;
};

export type SessionCognitionResponse = {
  meeting_plan?: import("./encounters").MeetingPlan | null;
  thought: string;
  mood: string;
  memory: string;
  reflection: string;
  importance: number;
  conversation: Conversation | null;
  participant_memories?: Record<string, string>;
  participant_reflections?: Record<string, string>;
  participant_outcomes?: Record<string, SocialOutcome>;
};

export type SocialOutcome = {
  invitation_response?: "accepted" | "declined" | "undecided" | "none";
  relationship_effect?: "neutral" | "positive" | "negative";
  relationship_reason?: string;
  task_complete?: boolean;
  mood?: string;
  thought?: string;
  feelings?: Partial<Feelings> & { reason?: string };
  /** What this person now wants to do because of the exchange, in their own words. */
  next_intention?: string;
};

export type Feelings = {
  affection: number;
  jealousy: number;
  resentment: number;
  admiration: number;
};

export type SessionTaskPlanRequest = {
  city: CityState;
  actor_id: string;
  task: string;
  memories: string[];
};

export type SessionTaskPlanResponse = {
  task_kind:
    | "targeted_talk"
    | "greet_all"
    | "ask_all"
    | "self_answer"
    | "open_task"
    | "go_to_location"
    | "go_with_citizen";
  target_citizen_ids: string[];
  location_id: string | null;
  reasoning_summary: string;
  player_visible_plan: string;
};
