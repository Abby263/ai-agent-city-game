import type {
  AssignTaskPayload,
  CityEvent,
  CityMetrics,
  CityState,
  CitizenAgent,
  Conversation,
  MayorPolicyPayload,
  Memory,
  Relationship,
  SessionCognitionRequest,
  SessionCognitionResponse,
  SimulationMode,
  TriggerEventPayload,
} from "@/lib/types";

const SESSION_VERSION = "v5";
const CITY_KEY = `agentcity.${SESSION_VERSION}.city`;
const MEMORIES_KEY = `agentcity.${SESSION_VERSION}.memories`;
const RELATIONSHIPS_KEY = `agentcity.${SESSION_VERSION}.relationships`;
const CONVERSATIONS_KEY = `agentcity.${SESSION_VERSION}.conversations`;

type PlayerTaskData = {
  task: string;
  location_id?: string | null;
  target_citizen_id?: string | null;
  target_citizen_ids?: string[];
  completed_target_ids?: string[];
  current_target_index?: number;
  task_kind?: "targeted_talk" | "greet_all" | "ask_all" | "self_answer" | "open_task";
  assigned_day?: number;
  assigned_minute?: number;
  expires_tick?: number;
  status?: string;
  last_cognition_tick?: number;
};

type GenerateCognition = (request: SessionCognitionRequest) => Promise<SessionCognitionResponse>;

export function sessionMemoryEnabled() {
  return typeof window !== "undefined" && process.env.NEXT_PUBLIC_MEMORY_MODE !== "server";
}

export function getSessionCity() {
  if (!sessionMemoryEnabled()) return null;
  return readJson<CityState>(CITY_KEY);
}

export function saveSessionCity(city: CityState) {
  if (!sessionMemoryEnabled()) return;
  writeJson(CITY_KEY, normalizeCity(city));
}

export function seedSession(city: CityState) {
  if (!sessionMemoryEnabled()) return city;
  const existing = getSessionCity();
  if (existing) return existing;

  const normalized = normalizeCity(city);
  writeJson(CITY_KEY, normalized);
  writeJson(MEMORIES_KEY, buildInitialMemories(normalized));
  writeJson(RELATIONSHIPS_KEY, buildInitialRelationships(normalized));
  writeJson(CONVERSATIONS_KEY, [] satisfies Conversation[]);
  return normalized;
}

export function sessionMemories(citizenId: string) {
  const city = getSessionCity();
  const memories = ensureMemories(city);
  return memories
    .filter((memory) => memory.citizen_id === citizenId)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 80);
}

export function sessionRelationships(citizenId: string) {
  const city = getSessionCity();
  const relationships = ensureRelationships(city);
  return relationships.filter((relationship) => relationship.citizen_id === citizenId);
}

export function sessionConversations(citizenId?: string) {
  const conversations = readJson<Conversation[]>(CONVERSATIONS_KEY) ?? [];
  const filtered = citizenId
    ? conversations.filter((conversation) => conversation.actor_ids.includes(citizenId))
    : conversations;
  return filtered
    .sort((a, b) => b.game_day - a.game_day || b.game_minute - a.game_minute)
    .slice(0, citizenId ? 50 : 80);
}

export async function sessionStart() {
  const city = requireSessionCity();
  if (city.simulation_mode === "manual" && activeTaskCitizens(city).length === 0) {
    city.clock.running = false;
    addEvent(city, {
      event_type: "manual_mode_waiting",
      description: "Manual mode is waiting for the player to assign a student task.",
      priority: 1,
    });
    return saveAndReturn(city);
  }
  city.clock.running = true;
  addEvent(city, {
    event_type: "simulation_started",
    description: "The city simulation started.",
    priority: 1,
  });
  return saveAndReturn(city);
}

export async function sessionPause() {
  const city = requireSessionCity();
  city.clock.running = false;
  addEvent(city, {
    event_type: "simulation_paused",
    description: "The city simulation paused.",
    priority: 1,
  });
  return saveAndReturn(city);
}

export async function sessionSetMode(mode: SimulationMode) {
  const city = requireSessionCity();
  const previousMode = city.simulation_mode;
  city.simulation_mode = mode;
  city.policy = { ...city.policy, simulation_mode: mode };
  city.clock.running = mode === "autonomous";
  if (previousMode !== mode) {
    addEvent(city, {
      event_type: mode === "manual" ? "manual_mode_enabled" : "autonomous_mode_enabled",
      description:
        mode === "manual"
          ? "Manual mode enabled. The city waits until the player assigns a student task."
          : "Autonomous mode enabled. Students resume daily life, conversations, and city reactions.",
      priority: 2,
    });
  }
  return saveAndReturn(city);
}

export async function sessionAssignTask(citizenId: string, payload: AssignTaskPayload) {
  const city = requireSessionCity();
  const citizen = findCitizen(city, citizenId);
  const target = payload.target_citizen_id ? findCitizen(city, payload.target_citizen_id) : null;
  const task = payload.task.trim();
  const taskPlan = planManualTask(city, citizen, task, target, payload);
  const locationId = taskPlan.location_id;
  const durationTicks = Math.max(payload.duration_ticks ?? 6, taskPlan.target_citizen_ids.length * 3 + 2);

  citizen.personality = {
    ...citizen.personality,
    player_task: {
      task,
      location_id: locationId,
      target_citizen_id: taskPlan.target_citizen_id,
      target_citizen_ids: taskPlan.target_citizen_ids,
      completed_target_ids: [],
      current_target_index: 0,
      task_kind: taskPlan.task_kind,
      assigned_day: city.clock.day,
      assigned_minute: city.clock.minute_of_day,
      expires_tick: city.clock.tick + durationTicks,
      status: "active",
    } satisfies PlayerTaskData,
  };
  citizen.current_activity = `Task: ${task}`;
  citizen.current_thought = `The player asked me to: ${task}. I should focus on that next.`;
  citizen.short_term_goals = [`Player task: ${task}`, ...withoutPlayerTask(citizen.short_term_goals)].slice(0, 5);
  if (city.simulation_mode === "manual") {
    city.clock.running = true;
  }

  addMemory({
    citizen_id: citizen.citizen_id,
    kind: "episodic",
    content: `The player assigned me a task: ${task}.`,
    importance: 0.78,
    salience: 0.82,
    related_citizen_id: target?.citizen_id ?? null,
    extra: { source: "player_task", location_id: locationId },
  });
  addEvent(city, {
    event_type: "player_task",
    location_id: locationId,
    actors: [citizen.citizen_id, ...taskPlan.target_citizen_ids].filter(Boolean),
    description: taskPlan.description,
    payload: {
      task,
      duration_ticks: durationTicks,
      target_citizen_id: taskPlan.target_citizen_id,
      target_citizen_ids: taskPlan.target_citizen_ids,
      task_kind: taskPlan.task_kind,
    },
    priority: 3,
  });

  return saveAndReturn(city);
}

export async function sessionCloseTask(citizenId: string) {
  const city = requireSessionCity();
  const citizen = findCitizen(city, citizenId);
  const task = playerTask(citizen);
  if (!task) return saveAndReturn(city);

  const closed = { ...task, status: "closed" };
  citizen.personality = { ...citizen.personality, player_task: closed };
  citizen.current_activity = "Waiting for the next player task";
  citizen.current_thought = `The player closed the task: ${task.task}.`;
  citizen.short_term_goals = withoutPlayerTask(citizen.short_term_goals);
  addMemory({
    citizen_id: citizen.citizen_id,
    kind: "episodic",
    content: `The player closed my task before it finished: ${task.task}.`,
    importance: 0.55,
    salience: 0.6,
    related_citizen_id: task.target_citizen_id ?? null,
    extra: { source: "player_task_closed" },
  });
  addEvent(city, {
    event_type: "player_task_closed",
    location_id: task.location_id ?? citizen.current_location_id,
    actors: [citizen.citizen_id],
    description: `The player closed ${citizen.name}'s task: ${task.task}`,
    payload: { task: task.task },
    priority: 2,
  });
  if (city.simulation_mode === "manual" && activeTaskCitizens(city).length === 0) {
    city.clock.running = false;
  }
  return saveAndReturn(city);
}

export async function sessionTick(generateCognition: GenerateCognition) {
  const city = requireSessionCity();
  const updateCitizens = city.simulation_mode === "manual" ? activeTaskCitizens(city) : city.citizens;
  if (city.simulation_mode === "manual" && updateCitizens.length === 0) {
    city.clock.running = false;
    return saveAndReturn(city);
  }

  const previousMinute = city.clock.minute_of_day;
  city.clock.tick += 1;
  city.clock.minute_of_day += 15;
  if (city.clock.minute_of_day >= 1440) {
    city.clock.minute_of_day %= 1440;
    city.clock.day += 1;
    addEvent(city, {
      event_type: "new_day",
      description: `Day ${city.clock.day} begins in Navora.`,
      priority: 2,
    });
  }

  const producedEvents: CityEvent[] = [];
  for (const citizen of updateCitizens) {
    producedEvents.push(...updateCitizen(city, citizen, previousMinute));
  }

  if (city.simulation_mode === "autonomous") {
    producedEvents.push(...runAutonomousSocial(city));
  }

  const cognitionCandidate = updateCitizens.find((citizen) => {
    const task = playerTask(citizen);
    return task?.status === "active" && task.last_cognition_tick !== city.clock.tick;
  });
  if (cognitionCandidate) {
    await runTaskCognition(city, cognitionCandidate, generateCognition).catch(() => {
      runTemplateCognition(city, cognitionCandidate);
    });
  }

  if (city.simulation_mode === "manual" && activeTaskCitizens(city).length === 0) {
    city.clock.running = false;
  }
  void producedEvents;
  return saveAndReturn(city);
}

export async function sessionTriggerEvent(payload: TriggerEventPayload) {
  const city = requireSessionCity();
  const locationId = payload.location_id ?? defaultEventLocation(payload.event_type);
  const severity = payload.severity ?? "medium";
  const multiplier = severity === "high" ? 1.45 : severity === "low" ? 0.6 : 1;
  let description = "A city event changes the students' day.";
  const actors: string[] = [];

  if (payload.event_type === "flu_outbreak") {
    description = "A flu outbreak starts spreading around the school.";
    for (const citizen of city.citizens) {
      actors.push(citizen.citizen_id);
      citizen.health = clamp(citizen.health - 12 * multiplier);
      citizen.stress = clamp(citizen.stress + 10 * multiplier);
      addMemory({
        citizen_id: citizen.citizen_id,
        kind: "episodic",
        content: "A flu outbreak is spreading around school, and everyone is watching who gets sick.",
        importance: 0.82,
        salience: 0.86,
        related_citizen_id: null,
        extra: { source: "flu_outbreak" },
      });
    }
  } else if (payload.event_type === "school_exam") {
    description = "The school starts an important exam day.";
    for (const citizen of city.citizens) {
      actors.push(citizen.citizen_id);
      citizen.stress = clamp(citizen.stress + 10 * multiplier);
    }
  } else if (payload.event_type === "city_festival") {
    description = "A city festival begins at the park and gives the students a reason to meet.";
    for (const citizen of city.citizens) {
      actors.push(citizen.citizen_id);
      citizen.happiness = clamp(citizen.happiness + 12 * multiplier);
      citizen.stress = clamp(citizen.stress - 8 * multiplier);
    }
  } else if (payload.event_type === "traffic_accident") {
    description = "A traffic accident blocks the bus stop route.";
    for (const citizen of city.citizens) {
      citizen.stress = clamp(citizen.stress + 5 * multiplier);
    }
  } else if (payload.event_type === "food_shortage") {
    description = "A food shortage hits the market and students talk about bringing lunch from home.";
    for (const citizen of city.citizens) {
      citizen.hunger = clamp(citizen.hunger + 8 * multiplier);
    }
  } else if (payload.event_type === "bank_policy_change") {
    description = "The bank changes youth savings rules and families start talking about money.";
  } else if (payload.event_type === "power_outage") {
    description = "A power outage interrupts morning routines across Navora.";
    for (const citizen of city.citizens) {
      citizen.stress = clamp(citizen.stress + 7 * multiplier);
    }
  }

  addEvent(city, {
    event_type: payload.event_type,
    location_id: locationId,
    actors,
    description,
    payload: { severity },
    priority: 3,
  });
  return saveAndReturn(city);
}

export async function sessionApplyPolicy(payload: MayorPolicyPayload) {
  const city = requireSessionCity();
  city.policy = { ...city.policy, ...payload };
  const changed = Object.keys(payload)
    .map((key) => key.replaceAll("_", " "))
    .join(", ");
  addEvent(city, {
    event_type: "mayor_policy",
    location_id: "loc_city_hall",
    actors: [city.citizens[0]?.citizen_id].filter(Boolean) as string[],
    description: changed ? `The mayor changed city policy: ${changed}.` : "The mayor reviewed city policy.",
    payload,
    priority: 2,
  });
  return saveAndReturn(city);
}

function planManualTask(
  city: CityState,
  citizen: CitizenAgent,
  task: string,
  target: CitizenAgent | null,
  payload: AssignTaskPayload,
) {
  const normalized = task.toLowerCase();
  const otherCitizens = city.citizens.filter((item) => item.citizen_id !== citizen.citizen_id);
  const mentionsEveryone = /\b(everyone|everybody|all|each|classmates|students|citizens)\b/.test(normalized);
  const asksAboutFriends = /\b(how many|who|list|tell me|do you have)\b.*\bfriends?\b|\bfriends?\b.*\b(how many|who|list|do you have)\b/.test(
    normalized,
  );
  const asksForSelfKnowledge =
    asksAboutFriends ||
    (/\b(how many|what|who|where|why|when)\b/.test(normalized) &&
      /\b(you|your|yourself|friends|goals|money|health|mood|schedule)\b/.test(normalized) &&
      !mentionsEveryone);
  const task_kind: NonNullable<PlayerTaskData["task_kind"]> = target
    ? "targeted_talk"
    : asksForSelfKnowledge
      ? "self_answer"
      : mentionsEveryone
        ? normalized.includes("ask") || normalized.includes("?")
          ? "ask_all"
          : "greet_all"
        : "open_task";
  const targetIds =
    task_kind === "greet_all" || task_kind === "ask_all"
      ? otherCitizens.map((item) => item.citizen_id)
      : target
        ? [target.citizen_id]
        : [];
  const firstTarget = targetIds[0] ? city.citizens.find((item) => item.citizen_id === targetIds[0]) : null;
  const locationId =
    payload.location_id ??
    target?.current_location_id ??
    firstTarget?.current_location_id ??
    (task_kind === "self_answer" ? citizen.current_location_id : "loc_school");

  return {
    task_kind,
    target_citizen_id: target?.citizen_id ?? firstTarget?.citizen_id ?? null,
    target_citizen_ids: targetIds,
    location_id: locationId,
    description:
      targetIds.length > 1
        ? `The player asked ${citizen.name} to visit ${targetIds.length} classmates: ${task}`
        : target
          ? `The player asked ${citizen.name} to work with ${target.name}: ${task}`
          : `The player asked ${citizen.name} to answer: ${task}`,
  };
}

function requireSessionCity() {
  const city = getSessionCity();
  if (!city) {
    throw new Error("No AgentCity session has been started.");
  }
  return clone(city);
}

function saveAndReturn(city: CityState) {
  const normalized = normalizeCity(city);
  saveSessionCity(normalized);
  return normalized;
}

function normalizeCity(city: CityState): CityState {
  const normalized = clone(city);
  normalized.events = normalized.events.slice(-80);
  normalized.metrics = calculateMetrics(normalized);
  return normalized;
}

function updateCitizen(city: CityState, citizen: CitizenAgent, previousMinute: number) {
  const events: CityEvent[] = [];
  const oldLocation = citizen.current_location_id;
  const task = playerTask(citizen);
  const taskWasActive = task?.status === "active";
  const [targetLocationId, activity] = desiredLocation(city, citizen);
  const activeTarget = taskWasActive && task ? currentTaskTarget(city, task) : null;
  const targetLocation = city.locations.find((location) => location.location_id === targetLocationId) ??
    city.locations.find((location) => location.location_id === citizen.home_location_id) ??
    city.locations[0];

  citizen.current_activity = activity;
  citizen.target_x = activeTarget?.x ?? targetLocation.x + Math.floor(targetLocation.width / 2);
  citizen.target_y = activeTarget?.y ?? targetLocation.y + Math.floor(targetLocation.height / 2);
  moveToward(citizen, citizen.target_x, citizen.target_y);
  const arrived = citizen.x === citizen.target_x && citizen.y === citizen.target_y;
  if (arrived) {
    citizen.current_location_id = targetLocation.location_id;
  }
  updateNeeds(citizen);
  if (arrived) applyLocationEffects(citizen, targetLocation.location_id);

  if (oldLocation !== citizen.current_location_id) {
    events.push(
      addEvent(city, {
        event_type: "citizen_arrived",
        location_id: citizen.current_location_id,
        actors: [citizen.citizen_id],
        description: `${citizen.name} arrived at ${targetLocation.name} for ${citizen.current_activity.toLowerCase()}.`,
        priority: 1,
      }),
    );
  }

  if (taskWasActive && task) {
    const actors = [citizen.citizen_id, activeTarget?.citizen_id ?? task.target_citizen_id].filter(Boolean) as string[];
    const progress = taskProgressLabel(city, citizen, task);
    events.push(
      addEvent(city, {
        event_type: activeTarget && !nearCitizen(citizen, activeTarget) ? "player_task_travel" : "player_task_progress",
        location_id: activeTarget?.current_location_id ?? targetLocation.location_id,
        actors,
        description: `${citizen.name} is ${progress}: ${task.task}`,
        payload: { task: task.task, progress },
        priority: 3,
      }),
    );
  } else if (previousMinute < 480 && city.clock.minute_of_day >= 480) {
    events.push(
      addEvent(city, {
        event_type: "school_day_started",
        location_id: citizen.work_location_id,
        actors: [citizen.citizen_id],
        description: `${citizen.name} started the school day.`,
        priority: 1,
      }),
    );
  }

  return events;
}

function desiredLocation(city: CityState, citizen: CitizenAgent): [string, string] {
  const task = playerTask(citizen);
  if (task?.status === "active") {
    const target = currentTaskTarget(city, task);
    if (target) {
      return [target.current_location_id, `Going to talk with ${target.name}`];
    }
    return [task.location_id ?? citizen.current_location_id, `Thinking through: ${task.task}`];
  }
  if (citizen.health < 55) return ["loc_hospital", "Seeking medical help"];
  if (citizen.hunger > 74) return ["loc_market", "Buying food"];
  if (citizen.energy < 22) return [citizen.home_location_id, "Resting at home"];
  const slot = citizen.daily_schedule.find((entry) => {
    const start = Number(entry.start);
    const end = Number(entry.end);
    return start <= city.clock.minute_of_day && city.clock.minute_of_day < end;
  });
  return [
    typeof slot?.location_id === "string" ? slot.location_id : citizen.home_location_id,
    typeof slot?.activity === "string" ? slot.activity : "Sleeping",
  ];
}

function runAutonomousSocial(city: CityState) {
  if (city.clock.tick % 3 !== 0) return [];
  const byLocation = new Map<string, CitizenAgent[]>();
  for (const citizen of city.citizens) {
    if (citizen.energy < 18 || citizen.stress > 88) continue;
    const people = byLocation.get(citizen.current_location_id) ?? [];
    people.push(citizen);
    byLocation.set(citizen.current_location_id, people);
  }
  const events: CityEvent[] = [];
  for (const [locationId, people] of byLocation) {
    if (people.length < 2 || events.length >= 1) continue;
    const first = people[city.clock.tick % people.length];
    const second = people[(city.clock.tick + 1) % people.length];
    if (!first || !second || first.citizen_id === second.citizen_id) continue;
    events.push(
      addEvent(city, {
        event_type: "social_opportunity",
        location_id: locationId,
        actors: [first.citizen_id, second.citizen_id],
        description: `${first.name} and ${second.name} have a natural chance to talk. They are ${relationshipLabelFromScore(first.relationship_scores[second.citizen_id] ?? 38)}.`,
        payload: { relationship: relationshipLabelFromScore(first.relationship_scores[second.citizen_id] ?? 38) },
        priority: 2,
      }),
    );
  }
  return events;
}

function currentTaskTarget(city: CityState, task: PlayerTaskData) {
  const targetIds = task.target_citizen_ids?.length
    ? task.target_citizen_ids
    : task.target_citizen_id
      ? [task.target_citizen_id]
      : [];
  const completed = new Set(task.completed_target_ids ?? []);
  const nextTargetId =
    targetIds.find((targetId) => !completed.has(targetId)) ??
    targetIds[task.current_target_index ?? 0] ??
    task.target_citizen_id ??
    null;
  return nextTargetId ? city.citizens.find((citizen) => citizen.citizen_id === nextTargetId) ?? null : null;
}

function nearCitizen(first: CitizenAgent, second: CitizenAgent) {
  return first.current_location_id === second.current_location_id && Math.abs(first.x - second.x) + Math.abs(first.y - second.y) <= 2;
}

function taskProgressLabel(city: CityState, citizen: CitizenAgent, task: PlayerTaskData) {
  if (task.task_kind === "self_answer") return "answering the player";
  const target = currentTaskTarget(city, task);
  if (!target) return "wrapping up the task";
  const completed = task.completed_target_ids?.length ?? 0;
  const total = task.target_citizen_ids?.length ?? (task.target_citizen_id ? 1 : 0);
  const count = total > 1 ? ` (${completed + 1}/${total})` : "";
  return nearCitizen(citizen, target) ? `talking with ${target.name}${count}` : `walking to ${target.name}${count}`;
}

async function runTaskCognition(city: CityState, citizen: CitizenAgent, generateCognition: GenerateCognition) {
  const task = playerTask(citizen);
  if (!task) return;
  if (task.task_kind === "self_answer" || (!task.target_citizen_id && !task.target_citizen_ids?.length)) {
    answerSelfTask(city, citizen, task);
    return;
  }
  const target = currentTaskTarget(city, task);
  if (!target) {
    finishManualTask(city, citizen, task, citizen.current_location_id);
    return;
  }
  if (!nearCitizen(citizen, target)) {
    citizen.current_thought = `I need to reach ${target.name} before I can do this task: ${task.task}`;
    citizen.personality = { ...citizen.personality, player_task: { ...task, last_cognition_tick: city.clock.tick } };
    return;
  }

  const response = await generateCognition({
    city,
    actor_id: citizen.citizen_id,
    target_id: target.citizen_id,
    task: task.task,
    observations: buildTaskObservations(city, citizen, target, task),
    memories: sessionMemories(citizen.citizen_id).slice(0, 5).map((memory) => memory.content),
  });
  applyCognition(city, citizen, target, task, response);
}

function buildTaskObservations(city: CityState, citizen: CitizenAgent, target: CitizenAgent, task: PlayerTaskData) {
  const relationshipScore = citizen.relationship_scores[target.citizen_id] ?? 38;
  const completed = task.completed_target_ids?.length ?? 0;
  const total = task.target_citizen_ids?.length ?? (task.target_citizen_id ? 1 : 0);
  const routeProgress = total > 1 ? `This is conversation ${completed + 1} of ${total} in a player-directed route.` : "";
  const taskIntent =
    task.task_kind === "greet_all"
      ? `${citizen.name} should literally greet ${target.name}, let ${target.name} answer, and leave a small human memory.`
      : task.task_kind === "ask_all"
        ? `${citizen.name} should ask ${target.name} the player's question, listen to the answer, and remember what was said.`
        : `${citizen.name} should talk with ${target.name} to make progress on the player's task.`;

  return [
    `Player task: "${task.task}". ${taskIntent}`,
    `${citizen.name} is physically near ${target.name} at ${locationName(city, citizen.current_location_id)}. ${routeProgress}`,
    `${citizen.name} and ${target.name} are ${relationshipLabelFromScore(relationshipScore)}. ${target.name} is ${target.mood.toLowerCase()} and currently ${target.current_activity.toLowerCase()}.`,
  ].filter(Boolean);
}

function locationName(city: CityState, locationId: string) {
  return city.locations.find((location) => location.location_id === locationId)?.name ?? locationId;
}

function runTemplateCognition(city: CityState, citizen: CitizenAgent) {
  const task = playerTask(citizen);
  if (!task) return;
  const target = currentTaskTarget(city, task);
  if (!target) return;
  applyCognition(city, citizen, target, task, {
    thought: `${target.name.split(" ")[0]} gave me something honest to remember. I should keep following up.`,
    mood: "Thoughtful",
    memory: `${citizen.name} talked with ${target.name} about: ${task.task}`,
    reflection: `${citizen.name} learned that small check-ins can start real trust.`,
    importance: 0.68,
    conversation: {
      conversation_id: newId("convo"),
      game_day: city.clock.day,
      game_minute: city.clock.minute_of_day,
      location_id: citizen.current_location_id,
      actor_ids: [citizen.citizen_id, target.citizen_id],
      summary: `${citizen.name} and ${target.name} had a focused talk. Relationship: ${relationshipLabelFromScore(citizen.relationship_scores[target.citizen_id] ?? 38)}.`,
      transcript: [
        {
          speaker_id: citizen.citizen_id,
          text: `I wanted to ask about this: ${task.task}`,
        },
        {
          speaker_id: target.citizen_id,
          text: "I am glad you asked. It makes school feel less lonely when someone notices.",
        },
        {
          speaker_id: citizen.citizen_id,
          text: "I will remember that and check in again later.",
        },
      ],
    },
  });
}

function answerSelfTask(city: CityState, citizen: CitizenAgent, task: PlayerTaskData) {
  const answer = selfAnswerForTask(city, citizen, task.task);
  citizen.current_activity = "Answered the player";
  citizen.current_thought = answer;
  citizen.mood = "Helpful";
  citizen.personality = { ...citizen.personality, player_task: { ...task, last_cognition_tick: city.clock.tick } };
  const conversation: Conversation = {
    conversation_id: newId("convo"),
    game_day: city.clock.day,
    game_minute: city.clock.minute_of_day,
    location_id: citizen.current_location_id,
    actor_ids: [citizen.citizen_id],
    summary: `${citizen.name} answered the player: ${answer}`,
    transcript: [
      {
        speaker_id: citizen.citizen_id,
        text: answer,
      },
    ],
  };
  writeJson(CONVERSATIONS_KEY, [conversation, ...sessionConversations()].slice(0, 80));
  addMemory({
    citizen_id: citizen.citizen_id,
    kind: "episodic",
    content: `The player asked me "${task.task}" and I answered: ${answer}`,
    importance: 0.62,
    salience: 0.66,
    related_citizen_id: null,
    extra: { source: "player_task_answer" },
  });
  addEvent(city, {
    event_type: "task_answer",
    location_id: citizen.current_location_id,
    actors: [citizen.citizen_id],
    description: `${citizen.name} answered: ${answer}`,
    payload: { task: task.task, answer },
    priority: 3,
  });
  finishManualTask(city, citizen, task, citizen.current_location_id);
}

function selfAnswerForTask(city: CityState, citizen: CitizenAgent, taskText: string) {
  const normalized = taskText.toLowerCase();
  if (normalized.includes("friend")) {
    const activeIds = new Set(city.citizens.map((item) => item.citizen_id));
    const closeFriends = citizen.friend_ids
      .filter((id) => activeIds.has(id))
      .map((id) => city.citizens.find((item) => item.citizen_id === id)?.name)
      .filter((name): name is string => Boolean(name));
    const acquaintances = Object.entries(citizen.relationship_scores)
      .filter(([id, score]) => activeIds.has(id) && !citizen.friend_ids.includes(id) && score >= 35)
      .map(([id]) => city.citizens.find((item) => item.citizen_id === id)?.name)
      .filter((name): name is string => Boolean(name));
    if (closeFriends.length > 0) {
      return `I have ${closeFriends.length} close friend${closeFriends.length === 1 ? "" : "s"} right now: ${closeFriends.join(", ")}. I also know ${acquaintances.length} other classmate${acquaintances.length === 1 ? "" : "s"} well enough to build a friendship.`;
    }
    return `I do not have a close friend yet, but I know ${acquaintances.join(", ") || "a few classmates"} as acquaintances. I should talk with them more.`;
  }
  if (normalized.includes("goal")) {
    return `My short-term goals are ${citizen.short_term_goals.join(", ")}. Long term, I want to ${citizen.long_term_goals.join(" and ")}.`;
  }
  if (normalized.includes("mood") || normalized.includes("feel")) {
    return `I feel ${citizen.mood.toLowerCase()} right now. My happiness is ${Math.round(citizen.happiness)} and my stress is ${Math.round(citizen.stress)}.`;
  }
  return `I can answer from what I know about myself: I am ${citizen.name}, a ${citizen.age}-year-old ${citizen.profession.toLowerCase()}, and right now I am ${citizen.current_activity.toLowerCase()}.`;
}

function applyCognition(
  city: CityState,
  citizen: CitizenAgent,
  target: CitizenAgent,
  task: PlayerTaskData,
  response: SessionCognitionResponse,
) {
  citizen.current_thought = response.thought;
  citizen.mood = response.mood || citizen.mood;
  citizen.memory_summary = compactSummary(citizen.memory_summary, response.memory);
  const previousCompleted = task.completed_target_ids ?? [];
  const completedTargetIds = Array.from(new Set([...previousCompleted, target.citizen_id]));
  const updatedTask = {
    ...task,
    completed_target_ids: completedTargetIds,
    current_target_index: completedTargetIds.length,
    target_citizen_id: nextTargetId(task, completedTargetIds),
    last_cognition_tick: city.clock.tick,
  };
  citizen.personality = { ...citizen.personality, player_task: updatedTask };

  addMemory({
    citizen_id: citizen.citizen_id,
    kind: "episodic",
    content: response.memory,
    importance: response.importance || 0.65,
    salience: response.importance || 0.65,
    related_citizen_id: target.citizen_id,
    extra: { source: "session_cognition", reflection: response.reflection },
  });
  addMemory({
    citizen_id: target.citizen_id,
    kind: "relationship",
    content: `${citizen.name} checked in with me: ${response.memory}`,
    importance: 0.58,
    salience: 0.62,
    related_citizen_id: citizen.citizen_id,
    extra: { source: "session_cognition" },
  });

  const conversation = response.conversation ?? fallbackTaskConversation(city, citizen, target, task.task, response.memory);
  if (conversation) {
    const savedConversation: Conversation = {
      ...conversation,
      conversation_id: conversation.conversation_id || newId("convo"),
      game_day: city.clock.day,
      game_minute: city.clock.minute_of_day,
      location_id: conversation.location_id ?? citizen.current_location_id,
      actor_ids: [citizen.citizen_id, target.citizen_id],
      transcript: twoSidedTranscript(conversation.transcript, citizen, target, task.task),
    };
    const before = relationshipLabelFromScore(citizen.relationship_scores[target.citizen_id] ?? 38);
    strengthenRelationship(city, citizen, target, savedConversation.summary);
    const after = relationshipLabelFromScore(citizen.relationship_scores[target.citizen_id] ?? 38);
    savedConversation.summary = `${savedConversation.summary} Relationship: ${before} -> ${after}.`;
    writeJson(CONVERSATIONS_KEY, [savedConversation, ...sessionConversations()].slice(0, 80));
    addEvent(city, {
      event_type: "conversation",
      location_id: savedConversation.location_id,
      actors: savedConversation.actor_ids,
      description: `${citizen.name} and ${target.name} talked: ${savedConversation.summary}`,
      payload: { conversation_id: savedConversation.conversation_id },
      priority: 2,
    });
  }

  const targetCount = task.target_citizen_ids?.length ?? (task.target_citizen_id ? 1 : 0);
  if (targetCount > 0 && completedTargetIds.length >= targetCount) {
    finishManualTask(city, citizen, updatedTask, citizen.current_location_id);
  } else {
    const nextTarget = currentTaskTarget(city, updatedTask);
    if (nextTarget) {
      citizen.current_thought = `I talked with ${target.name}. Next I need to find ${nextTarget.name}.`;
      citizen.current_activity = `Going to talk with ${nextTarget.name}`;
    }
  }
}

function fallbackTaskConversation(
  city: CityState,
  citizen: CitizenAgent,
  target: CitizenAgent,
  taskText: string,
  memory: string,
): Conversation {
  const normalized = taskText.toLowerCase();
  const isGreeting = /\b(hi|hello|greet|say hey|check in)\b/.test(normalized);
  const isQuestion = normalized.includes("?") || /\b(ask|find out|how many|what|who|why|when|where)\b/.test(normalized);
  const citizenLine = isGreeting
    ? `Hi ${target.name.split(" ")[0]}. I wanted to say hello and see how your day is going.`
    : isQuestion
      ? `I wanted to ask you this: ${taskText}`
      : `I wanted to talk with you about this: ${taskText}`;
  const targetLine = isGreeting
    ? `Hi ${citizen.name.split(" ")[0]}. Thanks for coming over. My day feels better when someone checks in.`
    : isQuestion
      ? "I can answer that from what I know. Thanks for asking me directly."
      : "Thanks for checking in. I will remember that you came over to talk to me.";
  return {
    conversation_id: newId("convo"),
    game_day: city.clock.day,
    game_minute: city.clock.minute_of_day,
    location_id: citizen.current_location_id,
    actor_ids: [citizen.citizen_id, target.citizen_id],
    summary: `${citizen.name} followed the task with ${target.name}: ${memory || taskText}`,
    transcript: [
      {
        speaker_id: citizen.citizen_id,
        text: citizenLine,
      },
      {
        speaker_id: target.citizen_id,
        text: targetLine,
      },
    ],
  };
}

function twoSidedTranscript(
  transcript: Conversation["transcript"],
  citizen: CitizenAgent,
  target: CitizenAgent,
  taskText: string,
) {
  const lines = transcript
    .filter((line) => line.speaker_id && line.text.trim())
    .map((line) => ({ speaker_id: line.speaker_id, text: line.text.trim() }));
  if (!lines.some((line) => line.speaker_id === citizen.citizen_id)) {
    lines.unshift({
      speaker_id: citizen.citizen_id,
      text: `I wanted to ask you about this: ${taskText}`,
    });
  }
  if (!lines.some((line) => line.speaker_id === target.citizen_id)) {
    const targetLine = {
      speaker_id: target.citizen_id,
      text: "I am a little nervous, but it helps that you asked me directly.",
    };
    lines.splice(Math.min(1, lines.length), 0, targetLine);
  }
  return lines.slice(0, 8);
}

function completeTask(city: CityState, citizen: CitizenAgent, task: PlayerTaskData, locationId: string) {
  const completed = {
    ...task,
    status: "completed",
    completed_day: city.clock.day,
    completed_minute: city.clock.minute_of_day,
  };
  citizen.personality = { ...citizen.personality, player_task: completed };
  citizen.current_activity = "Task completed";
  citizen.current_thought = `I finished the player task: ${task.task}.`;
  citizen.short_term_goals = withoutPlayerTask(citizen.short_term_goals);
  addMemory({
    citizen_id: citizen.citizen_id,
    kind: "episodic",
    content: `I completed the player task: ${task.task}.`,
    importance: 0.72,
    salience: 0.78,
    related_citizen_id: task.target_citizen_id ?? null,
    extra: { source: "player_task_completed", location_id: locationId },
  });
}

function finishManualTask(city: CityState, citizen: CitizenAgent, task: PlayerTaskData, locationId: string) {
  completeTask(city, citizen, task, locationId);
  addEvent(city, {
    event_type: "player_task_completed",
    location_id: locationId,
    actors: [citizen.citizen_id, ...(task.completed_target_ids ?? []), task.target_citizen_id].filter(Boolean) as string[],
    description: `${citizen.name} completed the player task: ${task.task}`,
    payload: {
      task: task.task,
      task_kind: task.task_kind,
      completed_target_ids: task.completed_target_ids ?? [],
    },
    priority: 3,
  });
}

function nextTargetId(task: PlayerTaskData, completedTargetIds: string[]) {
  const completed = new Set(completedTargetIds);
  return (task.target_citizen_ids ?? []).find((targetId) => !completed.has(targetId)) ?? null;
}

function strengthenRelationship(city: CityState, first: CitizenAgent, second: CitizenAgent, summary: string) {
  first.relationship_scores = {
    ...first.relationship_scores,
    [second.citizen_id]: clamp((first.relationship_scores[second.citizen_id] ?? 38) + 7, 0, 100),
  };
  second.relationship_scores = {
    ...second.relationship_scores,
    [first.citizen_id]: clamp((second.relationship_scores[first.citizen_id] ?? 38) + 7, 0, 100),
  };
  if ((first.relationship_scores[second.citizen_id] ?? 0) >= 58 && !first.friend_ids.includes(second.citizen_id)) {
    first.friend_ids = [...first.friend_ids, second.citizen_id];
  }
  if ((second.relationship_scores[first.citizen_id] ?? 0) >= 58 && !second.friend_ids.includes(first.citizen_id)) {
    second.friend_ids = [...second.friend_ids, first.citizen_id];
  }

  const relationships = ensureRelationships(city);
  writeJson(
    RELATIONSHIPS_KEY,
    relationships.map((relationship) => {
      if (
        !(
          (relationship.citizen_id === first.citizen_id && relationship.other_citizen_id === second.citizen_id) ||
          (relationship.citizen_id === second.citizen_id && relationship.other_citizen_id === first.citizen_id)
        )
      ) {
        return relationship;
      }
      return {
        ...relationship,
        familiarity: clamp(relationship.familiarity + 7),
        warmth: clamp(relationship.warmth + 4),
        trust: clamp(relationship.trust + 3),
        notes: `Recent interaction: ${summary} Current bond: ${relationshipLabel(relationship)}.`,
      };
    }),
  );
}

function playerTask(citizen: CitizenAgent): PlayerTaskData | null {
  const task = citizen.personality?.player_task;
  if (!task || typeof task !== "object") return null;
  const data = task as Record<string, unknown>;
  const taskText = typeof data.task === "string" ? data.task : "";
  if (!taskText) return null;
  return {
    task: taskText,
    location_id: typeof data.location_id === "string" ? data.location_id : null,
    target_citizen_id: typeof data.target_citizen_id === "string" ? data.target_citizen_id : null,
    target_citizen_ids: Array.isArray(data.target_citizen_ids)
      ? data.target_citizen_ids.filter((id): id is string => typeof id === "string")
      : [],
    completed_target_ids: Array.isArray(data.completed_target_ids)
      ? data.completed_target_ids.filter((id): id is string => typeof id === "string")
      : [],
    current_target_index: numberOrUndefined(data.current_target_index),
    task_kind:
      data.task_kind === "targeted_talk" ||
      data.task_kind === "greet_all" ||
      data.task_kind === "ask_all" ||
      data.task_kind === "self_answer" ||
      data.task_kind === "open_task"
        ? data.task_kind
        : "open_task",
    assigned_day: numberOrUndefined(data.assigned_day),
    assigned_minute: numberOrUndefined(data.assigned_minute),
    expires_tick: numberOrUndefined(data.expires_tick),
    status: typeof data.status === "string" ? data.status : "active",
    last_cognition_tick: numberOrUndefined(data.last_cognition_tick),
  };
}

function activeTaskCitizens(city: CityState) {
  return city.citizens.filter((citizen) => playerTask(citizen)?.status === "active");
}

function addEvent(
  city: CityState,
  input: {
    event_type: string;
    description: string;
    location_id?: string | null;
    actors?: string[];
    payload?: Record<string, unknown>;
    priority?: number;
  },
) {
  const event: CityEvent = {
    event_id: newId("evt"),
    timestamp: new Date().toISOString(),
    game_day: city.clock.day,
    game_minute: city.clock.minute_of_day,
    event_type: input.event_type,
    location_id: input.location_id ?? null,
    actors: input.actors ?? [],
    description: input.description,
    payload: input.payload ?? {},
    priority: input.priority ?? 1,
    visibility: "public",
  };
  city.events = [...city.events, event].slice(-80);
  return event;
}

function addMemory(input: Omit<Memory, "memory_id" | "created_at" | "source_event_id"> & { source_event_id?: string | null }) {
  if (!sessionMemoryEnabled()) return;
  const memories = readJson<Memory[]>(MEMORIES_KEY) ?? [];
  const memory: Memory = {
    memory_id: newId("mem"),
    source_event_id: input.source_event_id ?? null,
    created_at: new Date().toISOString(),
    ...input,
  };
  writeJson(MEMORIES_KEY, [memory, ...memories].slice(0, 250));
}

function buildInitialMemories(city: CityState): Memory[] {
  return city.citizens.map((citizen) => ({
    memory_id: `mem_seed_${citizen.citizen_id}`,
    citizen_id: citizen.citizen_id,
    kind: "semantic",
    content: citizen.memory_summary,
    importance: 0.55,
    salience: 0.55,
    related_citizen_id: null,
    source_event_id: null,
    extra: { source: "seed" },
    created_at: new Date().toISOString(),
  }));
}

function buildInitialRelationships(city: CityState): Relationship[] {
  return city.citizens.flatMap((citizen) =>
    city.citizens
      .filter((other) => other.citizen_id !== citizen.citizen_id)
      .map((other) => {
        const score = citizen.relationship_scores[other.citizen_id] ?? 38;
        return {
          relationship_id: `rel_${citizen.citizen_id}_${other.citizen_id}`,
          citizen_id: citizen.citizen_id,
          other_citizen_id: other.citizen_id,
          trust: clamp(score),
          warmth: clamp(score),
          familiarity: clamp(Math.max(12, score - 18)),
          notes: `${citizen.name} knows ${other.name} from school life in Navora.`,
        };
      }),
  );
}

function ensureMemories(city: CityState | null) {
  const memories = readJson<Memory[]>(MEMORIES_KEY);
  if (memories) return memories;
  const seeded = city ? buildInitialMemories(city) : [];
  writeJson(MEMORIES_KEY, seeded);
  return seeded;
}

function ensureRelationships(city: CityState | null) {
  const relationships = readJson<Relationship[]>(RELATIONSHIPS_KEY);
  if (relationships) return relationships;
  const seeded = city ? buildInitialRelationships(city) : [];
  writeJson(RELATIONSHIPS_KEY, seeded);
  return seeded;
}

function calculateMetrics(city: CityState): CityMetrics {
  const population = Math.max(1, city.citizens.length);
  const average = (selector: (citizen: CitizenAgent) => number) =>
    city.citizens.reduce((sum, citizen) => sum + selector(citizen), 0) / population;
  const recentEvents = city.events.slice(-20);
  return {
    population: city.citizens.length,
    average_happiness: round1(average((citizen) => citizen.happiness)),
    city_health: round1(average((citizen) => citizen.health)),
    economy_status: round1(Math.min(100, average((citizen) => citizen.money) / 2.2)),
    education_status: round1(average((citizen) => citizen.happiness)),
    traffic_status: round1(Math.max(0, 90 - recentEvents.filter((event) => event.event_type === "traffic_accident").length * 4)),
    sick_count: city.citizens.filter((citizen) => citizen.health < 65).length,
    active_events: recentEvents.filter((event) => event.priority >= 2).length,
  };
}

function moveToward(citizen: CitizenAgent, targetX: number, targetY: number) {
  const speed = 2;
  const dx = targetX - citizen.x;
  const dy = targetY - citizen.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
    citizen.x += Math.max(-speed, Math.min(speed, dx));
  } else if (dy !== 0) {
    citizen.y += Math.max(-speed, Math.min(speed, dy));
  } else if (dx !== 0) {
    citizen.x += Math.max(-speed, Math.min(speed, dx));
  }
}

function updateNeeds(citizen: CitizenAgent) {
  citizen.hunger = clamp(citizen.hunger + 3.1);
  citizen.energy = clamp(citizen.energy - 2.3);
  citizen.stress = clamp(citizen.stress + (citizen.energy < 30 ? 0.8 : 0.2));
  citizen.happiness = clamp(citizen.happiness - (citizen.hunger > 70 ? 0.8 : 0.1));
  if (citizen.hunger > 88 || citizen.energy < 12) {
    citizen.health = clamp(citizen.health - 1.5);
  }
}

function applyLocationEffects(citizen: CitizenAgent, locationId: string) {
  if (locationId === citizen.home_location_id && citizen.energy < 85) {
    citizen.energy = clamp(citizen.energy + 12);
    citizen.stress = clamp(citizen.stress - 5);
  }
  if (locationId === "loc_park") {
    citizen.stress = clamp(citizen.stress - 8);
    citizen.happiness = clamp(citizen.happiness + 4);
  }
  if (locationId === "loc_school" && citizen.profession === "Student") {
    citizen.happiness = clamp(citizen.happiness + 1);
  }
}

function findCitizen(city: CityState, citizenId: string) {
  const citizen = city.citizens.find((item) => item.citizen_id === citizenId);
  if (!citizen) throw new Error("Citizen not found in this AgentCity session.");
  return citizen;
}

function withoutPlayerTask(goals: string[]) {
  return goals.filter((goal) => !goal.startsWith("Player task:"));
}

function defaultEventLocation(eventType: TriggerEventPayload["event_type"]) {
  return {
    flu_outbreak: "loc_school",
    traffic_accident: "loc_bus_stop",
    food_shortage: "loc_market",
    school_exam: "loc_school",
    city_festival: "loc_park",
    bank_policy_change: "loc_bank",
    power_outage: "loc_city_hall",
  }[eventType];
}

function relationshipLabel(relationship: Relationship) {
  const score = (relationship.trust + relationship.warmth + relationship.familiarity) / 3;
  return relationshipLabelFromScore(score);
}

function relationshipLabelFromScore(score: number) {
  if (score >= 72) return "trusted friends";
  if (score >= 58) return "friends";
  if (score >= 35) return "acquaintances";
  return "strangers";
}

function compactSummary(existing: string, memory: string) {
  return `${existing} ${memory}`.trim().slice(-900);
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function clamp(value: number, minimum = 0, maximum = 100) {
  return Math.round(Math.max(minimum, Math.min(maximum, value)) * 100) / 100;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function newId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2, 18)}`;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function readJson<T>(key: string): T | null {
  if (!sessionMemoryEnabled()) return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!sessionMemoryEnabled()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Short-term memory is best effort in browsers with restricted storage.
  }
}
