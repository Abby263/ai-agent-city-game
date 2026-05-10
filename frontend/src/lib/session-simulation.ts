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
  SessionTaskPlanRequest,
  SessionTaskPlanResponse,
  SimulationMode,
  TriggerEventPayload,
} from "@/lib/types";

const SESSION_VERSION = "v10";
const CITY_KEY = `agentcity.${SESSION_VERSION}.city`;
const RELATIONSHIPS_KEY = `agentcity.${SESSION_VERSION}.relationships`;
const CONVERSATIONS_KEY = `agentcity.${SESSION_VERSION}.conversations`;

type PlayerTaskData = {
  task: string;
  location_id?: string | null;
  target_citizen_id?: string | null;
  target_citizen_ids?: string[];
  completed_target_ids?: string[];
  current_target_index?: number;
  task_kind?: "targeted_talk" | "greet_all" | "ask_all" | "self_answer" | "open_task" | "go_to_location" | "go_with_citizen";
  companion_confirmed?: boolean;
  plan_summary?: string;
  reasoning_summary?: string;
  assigned_day?: number;
  assigned_minute?: number;
  status?: string;
  last_cognition_tick?: number;
};

type CompanionTaskData = {
  leader_citizen_id: string;
  task: string;
  location_id: string;
  status?: string;
};

type GenerateCognition = (request: SessionCognitionRequest) => Promise<SessionCognitionResponse>;
type GenerateTaskPlan = (request: SessionTaskPlanRequest) => Promise<SessionTaskPlanResponse>;

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
  seedCitizenMemoryFiles(normalized);
  writeJson(RELATIONSHIPS_KEY, buildInitialRelationships(normalized));
  writeJson(CONVERSATIONS_KEY, [] satisfies Conversation[]);
  return normalized;
}

export function sessionMemories(citizenId: string) {
  const city = getSessionCity();
  const memories = ensureCitizenMemories(city, citizenId);
  return memories
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

function recentConversationFacts(citizenId?: string) {
  const conversations = sessionConversations(citizenId)
    .slice(0, 8)
    .sort((a, b) => a.game_day - b.game_day || a.game_minute - b.game_minute);
  return conversations.map((conversation) => {
    const turns = conversation.transcript
      .slice(0, 8)
      .map((line) => `${line.speaker_id}: ${line.text}`)
      .join(" | ");
    return `Day ${conversation.game_day} ${clockLabel(conversation.game_minute)}: ${conversation.summary} Transcript: ${turns}`;
  });
}

function clockLabel(minuteOfDay: number) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
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

export async function sessionAssignTask(citizenId: string, payload: AssignTaskPayload, generateTaskPlan: GenerateTaskPlan) {
  const city = requireSessionCity();
  const citizen = findCitizen(city, citizenId);
  const task = payload.task.trim();
  const taskPlan = await planManualTask(city, citizen, task, generateTaskPlan).catch(() => null);
  if (!taskPlan) {
    blockManualTask(
      city,
      citizen,
      {
        task,
        status: "blocked",
        task_kind: "open_task",
        location_id: citizen.current_location_id,
        plan_summary: "The AI planner was unavailable, so the citizen could not decide how to act.",
      },
      "agent_planning_blocked",
      `${citizen.name} could not plan the player task because AI planning was unavailable: ${task}`,
    );
    return saveAndReturn(city);
  }
  const locationId = taskPlan.location_id;

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
      plan_summary: taskPlan.player_visible_plan,
      reasoning_summary: taskPlan.reasoning_summary,
      assigned_day: city.clock.day,
      assigned_minute: city.clock.minute_of_day,
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
    content: `The player assigned me a task: ${task}. My plan: ${taskPlan.player_visible_plan}`,
    importance: 0.78,
    salience: 0.82,
    related_citizen_id: taskPlan.target_citizen_id,
    extra: { source: "player_task", location_id: locationId },
  });
  addEvent(city, {
    event_type: "player_task",
    location_id: locationId,
    actors: [citizen.citizen_id, ...taskPlan.target_citizen_ids].filter(Boolean),
    description: taskPlan.player_visible_plan,
    payload: {
      task,
      target_citizen_id: taskPlan.target_citizen_id,
      target_citizen_ids: taskPlan.target_citizen_ids,
      task_kind: taskPlan.task_kind,
      reasoning_summary: taskPlan.reasoning_summary,
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
      const task = playerTask(cognitionCandidate);
      if (task) {
        blockManualTask(
          city,
          cognitionCandidate,
          task,
          "agent_cognition_blocked",
          `${cognitionCandidate.name} could not continue the task because AI cognition was unavailable: ${task.task}`,
        );
      }
    });
  } else if (city.simulation_mode === "autonomous") {
    const socialMoment = producedEvents.find((event) => event.event_type === "social_opportunity");
    if (socialMoment) {
      await runAutonomousCognition(city, socialMoment, generateCognition).catch(() => {
        addEvent(city, {
          event_type: "agent_cognition_blocked",
          location_id: socialMoment.location_id,
          actors: socialMoment.actors,
          description: "An autonomous conversation could not continue because AI cognition was unavailable.",
          payload: { source_event_id: socialMoment.event_id },
          priority: 3,
        });
      });
    }
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
      citizen.health = clamp(citizen.health - 28 * multiplier);
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

async function planManualTask(
  city: CityState,
  citizen: CitizenAgent,
  task: string,
  generateTaskPlan: GenerateTaskPlan,
) {
  const plan = await generateTaskPlan({
    city,
    actor_id: citizen.citizen_id,
    task,
    memories: scopedPrivateMemoryContext(citizen, task).slice(0, 8),
  });
  const validCitizenIds = new Set(city.citizens.filter((item) => item.citizen_id !== citizen.citizen_id).map((item) => item.citizen_id));
  const validLocationIds = new Set(city.locations.map((location) => location.location_id));
  const inferredTargetIds = inferMentionedCitizenIds(task, city, citizen.citizen_id);
  const targetIds = Array.from(
    new Set([...plan.target_citizen_ids, ...inferredTargetIds].filter((targetId) => validCitizenIds.has(targetId))),
  );
  const firstTarget = targetIds[0] ? city.citizens.find((item) => item.citizen_id === targetIds[0]) : null;
  const inferredLocationId = inferMentionedLocationId(task, city);
  const locationId =
    (plan.location_id && validLocationIds.has(plan.location_id) ? plan.location_id : null) ??
    inferredLocationId ??
    firstTarget?.current_location_id ??
    citizen.current_location_id;
  const taskKind = normalizePlannedTaskKind(task, plan.task_kind, Boolean(firstTarget), Boolean(inferredLocationId));

  return {
    task_kind: taskKind,
    target_citizen_id: firstTarget?.citizen_id ?? null,
    target_citizen_ids: targetIds,
    location_id: locationId,
    reasoning_summary: plan.reasoning_summary,
    player_visible_plan: plan.player_visible_plan || `${citizen.name} is deciding how to handle: ${task}`,
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
  if (arrived) {
    const companionTask = activeCompanionTask(citizen);
    if (companionTask && citizen.current_location_id === companionTask.location_id) {
      citizen.personality = {
        ...citizen.personality,
        companion_task: { ...companionTask, status: "completed" },
      };
      citizen.current_thought = `I arrived at ${locationName(city, companionTask.location_id)} with the group.`;
    }
    if (taskWasActive && task && locationTaskReadyToFinish(citizen, task)) {
      finishLocationTask(city, citizen, task, citizen.current_location_id);
    }
  }

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

  const taskAfterArrival = playerTask(citizen);
  if (taskAfterArrival?.status === "active") {
    const activeTaskTarget = currentTaskTarget(city, taskAfterArrival);
    const actors = [citizen.citizen_id, activeTaskTarget?.citizen_id ?? taskAfterArrival.target_citizen_id].filter(Boolean) as string[];
    const progress = taskProgressLabel(city, citizen, taskAfterArrival);
    events.push(
      addEvent(city, {
        event_type: activeTaskTarget && !nearCitizen(citizen, activeTaskTarget) ? "player_task_travel" : "player_task_progress",
        location_id: activeTaskTarget?.current_location_id ?? targetLocation.location_id,
        actors,
        description: `${citizen.name} is ${progress}: ${taskAfterArrival.task}`,
        payload: { task: taskAfterArrival.task, progress },
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
    if (task.task_kind === "go_to_location") {
      return [task.location_id ?? citizen.current_location_id, `Going to ${locationName(city, task.location_id ?? citizen.current_location_id)}`];
    }
    if (task.task_kind === "go_with_citizen" && task.companion_confirmed) {
      const companion = task.target_citizen_id
        ? city.citizens.find((item) => item.citizen_id === task.target_citizen_id)
        : null;
      return [
        task.location_id ?? citizen.current_location_id,
        `Going to ${locationName(city, task.location_id ?? citizen.current_location_id)}${companion ? ` with ${companion.name}` : ""}`,
      ];
    }
    const target = currentTaskTarget(city, task);
    if (target) {
      return [
        target.current_location_id,
        task.task_kind === "go_with_citizen"
          ? `Going to coordinate with ${target.name}`
          : `Going to talk with ${target.name}`,
      ];
    }
    return [task.location_id ?? citizen.current_location_id, `Thinking through: ${task.task}`];
  }
  const companionTask = activeCompanionTask(citizen);
  if (companionTask) {
    const leader = city.citizens.find((item) => item.citizen_id === companionTask.leader_citizen_id);
    return [
      companionTask.location_id,
      `Going to ${locationName(city, companionTask.location_id)}${leader ? ` with ${leader.name}` : ""}`,
    ];
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
  if (task.task_kind === "go_with_citizen" && task.companion_confirmed) return null;
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
  if (task.task_kind === "go_to_location") return `walking to ${locationName(city, task.location_id ?? citizen.current_location_id)}`;
  if (task.task_kind === "go_with_citizen" && task.companion_confirmed) {
    return `walking to ${locationName(city, task.location_id ?? citizen.current_location_id)} with the companion`;
  }
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
  const target = currentTaskTarget(city, task);
  if (!target && isLocationTask(task)) {
    citizen.current_thought = `I am focused on the current task: ${task.task}`;
    citizen.personality = { ...citizen.personality, player_task: { ...task, last_cognition_tick: city.clock.tick } };
    return;
  }
  if (!target) {
    const response = await generateCognition({
      city,
      actor_id: citizen.citizen_id,
      target_id: null,
      task: task.task,
      observations: buildSoloTaskObservations(city, citizen, task),
      memories: scopedPrivateMemoryContext(citizen, task.task),
      private_memories: {
        [citizen.citizen_id]: scopedPrivateMemoryContext(citizen, task.task),
      },
    });
    applySoloCognition(city, citizen, task, response);
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
    required_target_id: target.citizen_id,
    require_conversation: true,
    task: task.task,
    observations: buildTaskObservations(city, citizen, target, task),
    memories: scopedPrivateMemoryContext(citizen, task.task, target),
    private_memories: {
      [citizen.citizen_id]: scopedPrivateMemoryContext(citizen, task.task, target),
      [target.citizen_id]: scopedPrivateMemoryContext(target, task.task, citizen),
    },
  });
  applyCognition(city, citizen, target, task, response);
}

function buildSoloTaskObservations(city: CityState, citizen: CitizenAgent, task: PlayerTaskData) {
  return [
    `Player task: "${task.task}". ${citizen.name} has chosen to handle this without a conversation target.`,
    task.plan_summary ? `Agent plan visible to player: ${task.plan_summary}` : "",
    task.reasoning_summary ? `Agent private planning summary: ${task.reasoning_summary}` : "",
    `${citizen.name} is at ${locationName(city, citizen.current_location_id)}, mood ${citizen.mood}, currently ${citizen.current_activity.toLowerCase()}.`,
    `The answer or next action must come from ${citizen.name}'s own memory, relationships, goals, and current state.`,
  ].filter(Boolean);
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
        : task.task_kind === "go_with_citizen"
          ? `${citizen.name} should ask ${target.name} to go to ${locationName(city, task.location_id ?? citizen.current_location_id)} together, wait for ${target.name}'s response, and then go there.`
          : `${citizen.name} should talk with ${target.name} to make progress on the player's task.`;

  return [
    `Player task: "${task.task}". ${taskIntent}`,
    "Current-task boundary: this is the only active player task. Do not continue, re-ask, or summarize an older task from memory unless the current task explicitly asks for it.",
    `${citizen.name} is physically near ${target.name} at ${locationName(city, citizen.current_location_id)}. ${routeProgress}`,
    `${citizen.name} and ${target.name} are ${relationshipLabelFromScore(relationshipScore)}. ${target.name} is ${target.mood.toLowerCase()} and currently ${target.current_activity.toLowerCase()}.`,
    "Memory boundary: the actor only knows their own memories and what other citizens say out loud in this conversation. Do not invent private facts for the target.",
    ...recentConversationFacts(citizen.citizen_id).map((fact) => `Private memory evidence for ${citizen.name}: ${fact}`),
  ].filter(Boolean);
}

function privateMemoryContext(citizen: CitizenAgent) {
  const memories = sessionMemories(citizen.citizen_id)
    .slice(0, 6)
    .map((memory) => `${citizen.name} private memory: ${memory.content}`);
  const conversations = recentConversationFacts(citizen.citizen_id)
    .slice(-6)
    .map((fact) => `${citizen.name} private conversation memory: ${fact}`);
  return [...memories, ...conversations];
}

function scopedPrivateMemoryContext(citizen: CitizenAgent, currentTask: string, target?: CitizenAgent | null) {
  const rawMemories = sessionMemories(citizen.citizen_id);
  const seed = rawMemories
    .filter((memory) => memory.extra?.source === "seed")
    .slice(0, 1)
    .map((memory) => `${citizen.name} private identity memory: ${memory.content}`);
  const relevant = rawMemories
    .filter((memory) => memory.extra?.source !== "seed")
    .filter((memory) => memoryRelevantToCurrentTask(memory.content, currentTask, target))
    .slice(0, 5)
    .map((memory) => `${citizen.name} private memory relevant to current task: ${memory.content}`);
  const conversations = recentConversationFacts(citizen.citizen_id)
    .filter((fact) => memoryRelevantToCurrentTask(fact, currentTask, target))
    .slice(0, 4)
    .map((fact) => `${citizen.name} private conversation history relevant to current task: ${fact}`);
  return [
    `${citizen.name} current active task, highest priority: ${currentTask}`,
    "Prior memories are background only. Do not continue a prior task or repeat a prior topic unless the current active task explicitly asks for it.",
    ...seed,
    ...relevant,
    ...conversations,
  ];
}

function locationName(city: CityState, locationId: string) {
  return city.locations.find((location) => location.location_id === locationId)?.name ?? locationId;
}

async function runAutonomousCognition(city: CityState, event: CityEvent, generateCognition: GenerateCognition) {
  const [actorId, targetId] = event.actors;
  if (!actorId || !targetId) return;
  const actor = city.citizens.find((citizen) => citizen.citizen_id === actorId);
  const target = city.citizens.find((citizen) => citizen.citizen_id === targetId);
  if (!actor || !target) return;

  const relationshipScore = actor.relationship_scores[target.citizen_id] ?? 38;
  const response = await generateCognition({
    city,
    actor_id: actor.citizen_id,
    target_id: target.citizen_id,
    required_target_id: target.citizen_id,
    require_conversation: true,
    task: `Have a natural city conversation with ${target.name}.`,
    observations: [
      `Autonomous social moment: ${event.description}`,
      `${actor.name} and ${target.name} are ${relationshipLabelFromScore(relationshipScore)} at ${locationName(city, actor.current_location_id)}.`,
      `${actor.name} is ${actor.mood.toLowerCase()} and ${target.name} is ${target.mood.toLowerCase()}.`,
      "Let them talk like real students. The conversation should reveal whether they are strangers, acquaintances, or becoming friends.",
      ...recentConversationFacts(actor.citizen_id).map((fact) => `Recent actor conversation: ${fact}`),
    ],
    memories: privateMemoryContext(actor),
    private_memories: {
      [actor.citizen_id]: privateMemoryContext(actor),
      [target.citizen_id]: privateMemoryContext(target),
    },
  });
  applyAutonomousCognition(city, actor, target, event, response);
}

function applyAutonomousCognition(
  city: CityState,
  actor: CitizenAgent,
  target: CitizenAgent,
  sourceEvent: CityEvent,
  response: SessionCognitionResponse,
) {
  actor.current_thought = response.thought;
  actor.mood = response.mood || actor.mood;
  const actorMemory = response.participant_memories?.[actor.citizen_id] ?? response.memory;
  const targetMemory = response.participant_memories?.[target.citizen_id] ?? "";
  actor.memory_summary = compactSummary(actor.memory_summary, actorMemory);

  addMemory({
    citizen_id: actor.citizen_id,
    kind: "episodic",
    content: actorMemory,
    importance: response.importance || 0.58,
    salience: response.importance || 0.58,
    related_citizen_id: target.citizen_id,
    extra: {
      source: "autonomous_cognition",
      reflection: response.participant_reflections?.[actor.citizen_id] ?? response.reflection,
      source_event_id: sourceEvent.event_id,
    },
  });
  if (targetMemory) {
    target.memory_summary = compactSummary(target.memory_summary, targetMemory);
    addMemory({
      citizen_id: target.citizen_id,
      kind: "episodic",
      content: targetMemory,
      importance: response.importance || 0.58,
      salience: response.importance || 0.58,
      related_citizen_id: actor.citizen_id,
      extra: {
        source: "autonomous_cognition",
        reflection: response.participant_reflections?.[target.citizen_id] ?? "",
        source_event_id: sourceEvent.event_id,
      },
    });
  }

  const conversation = validTaskConversation(response.conversation, actor, target);
  if (!conversation) {
    addEvent(city, {
      event_type: "agent_cognition_blocked",
      location_id: sourceEvent.location_id,
      actors: [actor.citizen_id, target.citizen_id],
      description: `${actor.name} and ${target.name} did not produce a complete AI conversation.`,
      payload: { source_event_id: sourceEvent.event_id },
      priority: 3,
    });
    return;
  }

  const before = relationshipLabelFromScore(actor.relationship_scores[target.citizen_id] ?? 38);
  const savedConversation: Conversation = {
    ...conversation,
    conversation_id: conversation.conversation_id || newId("convo"),
    game_day: city.clock.day,
    game_minute: city.clock.minute_of_day,
    location_id: conversation.location_id ?? actor.current_location_id,
    actor_ids: [actor.citizen_id, target.citizen_id],
    transcript: conversation.transcript.slice(0, 8),
  };
  strengthenRelationship(city, actor, target, savedConversation.summary);
  const after = relationshipLabelFromScore(actor.relationship_scores[target.citizen_id] ?? 38);
  savedConversation.summary = `${savedConversation.summary} Relationship: ${before} -> ${after}.`;
  writeJson(CONVERSATIONS_KEY, [savedConversation, ...sessionConversations()].slice(0, 80));
  addEvent(city, {
    event_type: "conversation",
    location_id: savedConversation.location_id,
    actors: savedConversation.actor_ids,
    description: `${actor.name} and ${target.name} talked autonomously: ${savedConversation.summary}`,
    payload: { conversation_id: savedConversation.conversation_id, source_event_id: sourceEvent.event_id },
    priority: 2,
  });
}

function applySoloCognition(city: CityState, citizen: CitizenAgent, task: PlayerTaskData, response: SessionCognitionResponse) {
  const answer = response.thought || response.memory || response.reflection;
  const citizenMemory = response.participant_memories?.[citizen.citizen_id] ?? response.memory;
  citizen.current_activity = "Answered the player";
  citizen.current_thought = answer;
  citizen.mood = response.mood || citizen.mood;
  citizen.memory_summary = compactSummary(citizen.memory_summary, citizenMemory);
  citizen.personality = { ...citizen.personality, player_task: { ...task, last_cognition_tick: city.clock.tick } };

  addMemory({
    citizen_id: citizen.citizen_id,
    kind: "episodic",
    content: citizenMemory || `${citizen.name} handled the player task: ${task.task}`,
    importance: response.importance || 0.64,
    salience: response.importance || 0.64,
    related_citizen_id: null,
    extra: {
      source: "session_cognition",
      reflection: response.participant_reflections?.[citizen.citizen_id] ?? response.reflection,
      task_kind: task.task_kind,
    },
  });

  const responseConversation = response.conversation;
  const conversation: Conversation = responseConversation
    ? {
        ...responseConversation,
        conversation_id: responseConversation.conversation_id || newId("convo"),
        game_day: city.clock.day,
        game_minute: city.clock.minute_of_day,
        location_id: responseConversation.location_id ?? citizen.current_location_id,
        actor_ids: [citizen.citizen_id],
        transcript: responseConversation.transcript.length
          ? responseConversation.transcript
          : [{ speaker_id: citizen.citizen_id, text: answer }],
      }
    : {
        conversation_id: newId("convo"),
        game_day: city.clock.day,
        game_minute: city.clock.minute_of_day,
        location_id: citizen.current_location_id,
        actor_ids: [citizen.citizen_id],
        summary: `${citizen.name} answered the player: ${answer}`,
        transcript: [{ speaker_id: citizen.citizen_id, text: answer }],
      };
  writeJson(CONVERSATIONS_KEY, [conversation, ...sessionConversations()].slice(0, 80));
  addEvent(city, {
    event_type: "task_answer",
    location_id: citizen.current_location_id,
    actors: [citizen.citizen_id],
    description: `${citizen.name} answered through AI cognition: ${answer}`,
    payload: { task: task.task, conversation_id: conversation.conversation_id },
    priority: 3,
  });
  finishManualTask(city, citizen, task, citizen.current_location_id);
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
  const actorMemory = response.participant_memories?.[citizen.citizen_id] ?? response.memory;
  const targetMemory =
    response.participant_memories?.[target.citizen_id] ??
    `${target.name} remembers that ${citizen.name} spoke with them about: ${task.task}.`;
  citizen.memory_summary = compactSummary(citizen.memory_summary, actorMemory);
  target.memory_summary = compactSummary(target.memory_summary, targetMemory);
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
    content: actorMemory,
    importance: response.importance || 0.65,
    salience: response.importance || 0.65,
    related_citizen_id: target.citizen_id,
    extra: {
      source: "session_cognition",
      reflection: response.participant_reflections?.[citizen.citizen_id] ?? response.reflection,
    },
  });
  addMemory({
    citizen_id: target.citizen_id,
    kind: "relationship",
    content: targetMemory,
    importance: 0.58,
    salience: 0.62,
    related_citizen_id: citizen.citizen_id,
    extra: {
      source: "session_cognition",
      reflection: response.participant_reflections?.[target.citizen_id] ?? "",
    },
  });

  const conversation = validTaskConversation(response.conversation, citizen, target);
  if (!conversation) {
    blockManualTask(
      city,
      citizen,
      task,
      "agent_cognition_blocked",
      `${citizen.name} could not complete the task because the AI did not produce a real exchange with ${target.name}.`,
    );
    return;
  }
  if (conversation) {
    const savedConversation: Conversation = {
      ...conversation,
      conversation_id: conversation.conversation_id || newId("convo"),
      game_day: city.clock.day,
      game_minute: city.clock.minute_of_day,
      location_id: conversation.location_id ?? citizen.current_location_id,
      actor_ids: [citizen.citizen_id, target.citizen_id],
      transcript: conversation.transcript
        .filter((line) => line.speaker_id && line.text.trim())
        .map((line) => ({ speaker_id: line.speaker_id, text: line.text.trim() }))
        .slice(0, 8),
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

  if (task.task_kind === "go_with_citizen") {
    const destinationId = task.location_id ?? citizen.current_location_id;
    const coordinatedTask = {
      ...updatedTask,
      companion_confirmed: true,
      target_citizen_id: target.citizen_id,
      target_citizen_ids: [target.citizen_id],
      completed_target_ids: [target.citizen_id],
      last_cognition_tick: city.clock.tick,
    };
    citizen.personality = { ...citizen.personality, player_task: coordinatedTask };
    citizen.current_activity = `Going to ${locationName(city, destinationId)} with ${target.name}`;
    citizen.current_thought = `${target.name} and I are going to ${locationName(city, destinationId)} together.`;
    target.personality = {
      ...target.personality,
      companion_task: {
        leader_citizen_id: citizen.citizen_id,
        task: task.task,
        location_id: destinationId,
        status: "active",
      } satisfies CompanionTaskData,
    };
    target.current_activity = `Going to ${locationName(city, destinationId)} with ${citizen.name}`;
    target.current_thought = `${citizen.name} asked me to go to ${locationName(city, destinationId)} together.`;
    addEvent(city, {
      event_type: "companion_task_confirmed",
      location_id: citizen.current_location_id,
      actors: [citizen.citizen_id, target.citizen_id],
      description: `${citizen.name} and ${target.name} agreed to go to ${locationName(city, destinationId)} together.`,
      payload: { task: task.task, location_id: destinationId },
      priority: 3,
    });
    return;
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

function validTaskConversation(
  conversation: Conversation | null | undefined,
  citizen: CitizenAgent,
  target: CitizenAgent,
): Conversation | null {
  if (!conversation) return null;
  const lines = conversation.transcript
    .filter((line) => line.speaker_id && line.text.trim())
    .map((line) => ({ speaker_id: line.speaker_id, text: line.text.trim() }));
  const hasActorLine = lines.some((line) => line.speaker_id === citizen.citizen_id);
  const hasTargetLine = lines.some((line) => line.speaker_id === target.citizen_id);
  if (!hasActorLine || !hasTargetLine || lines.length < 2) return null;
  return { ...conversation, transcript: lines };
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

function blockManualTask(
  city: CityState,
  citizen: CitizenAgent,
  task: PlayerTaskData,
  eventType: "agent_planning_blocked" | "agent_cognition_blocked",
  description: string,
) {
  const blocked = {
    ...task,
    status: "blocked",
    blocked_day: city.clock.day,
    blocked_minute: city.clock.minute_of_day,
  };
  citizen.personality = { ...citizen.personality, player_task: blocked };
  citizen.current_activity = "AI planning unavailable";
  citizen.current_thought = "I need my AI cognition before I can handle that task like a real person.";
  citizen.short_term_goals = withoutPlayerTask(citizen.short_term_goals);
  addEvent(city, {
    event_type: eventType,
    location_id: task.location_id ?? citizen.current_location_id,
    actors: [citizen.citizen_id],
    description,
    payload: { task: task.task },
    priority: 3,
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

function isLocationTask(task: PlayerTaskData) {
  return task.task_kind === "go_to_location" || task.task_kind === "go_with_citizen";
}

function locationTaskReadyToFinish(citizen: CitizenAgent, task: PlayerTaskData) {
  if (task.status !== "active" || !isLocationTask(task) || !task.location_id) return false;
  if (citizen.current_location_id !== task.location_id) return false;
  return task.task_kind === "go_to_location" || Boolean(task.companion_confirmed);
}

function finishLocationTask(city: CityState, citizen: CitizenAgent, task: PlayerTaskData, locationId: string) {
  if (task.task_kind === "go_with_citizen") {
    for (const targetId of task.target_citizen_ids ?? []) {
      const target = city.citizens.find((item) => item.citizen_id === targetId);
      const companionTask = target ? activeCompanionTask(target) : null;
      if (target && companionTask?.leader_citizen_id === citizen.citizen_id) {
        target.personality = {
          ...target.personality,
          companion_task: { ...companionTask, status: "completed" },
        };
        target.current_activity = `Arrived at ${locationName(city, locationId)} with ${citizen.name}`;
        target.current_thought = `I went to ${locationName(city, locationId)} with ${citizen.name}.`;
      }
    }
  }
  finishManualTask(city, citizen, task, locationId);
}

function activeCompanionTask(citizen: CitizenAgent): CompanionTaskData | null {
  const raw = citizen.personality?.companion_task;
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const leaderId = typeof data.leader_citizen_id === "string" ? data.leader_citizen_id : "";
  const task = typeof data.task === "string" ? data.task : "";
  const locationId = typeof data.location_id === "string" ? data.location_id : "";
  const status = typeof data.status === "string" ? data.status : "active";
  if (!leaderId || !task || !locationId || status !== "active") return null;
  return {
    leader_citizen_id: leaderId,
    task,
    location_id: locationId,
    status,
  };
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
      data.task_kind === "open_task" ||
      data.task_kind === "go_to_location" ||
      data.task_kind === "go_with_citizen"
        ? data.task_kind
        : "open_task",
    companion_confirmed: data.companion_confirmed === true,
    plan_summary: typeof data.plan_summary === "string" ? data.plan_summary : undefined,
    reasoning_summary: typeof data.reasoning_summary === "string" ? data.reasoning_summary : undefined,
    assigned_day: numberOrUndefined(data.assigned_day),
    assigned_minute: numberOrUndefined(data.assigned_minute),
    status: typeof data.status === "string" ? data.status : "active",
    last_cognition_tick: numberOrUndefined(data.last_cognition_tick),
  };
}

function activeTaskCitizens(city: CityState) {
  return city.citizens.filter((citizen) => playerTask(citizen)?.status === "active" || Boolean(activeCompanionTask(citizen)));
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
  const memories = readJson<Memory[]>(citizenMemoryKey(input.citizen_id)) ?? [];
  const memory: Memory = {
    memory_id: newId("mem"),
    source_event_id: input.source_event_id ?? null,
    created_at: new Date().toISOString(),
    ...input,
  };
  writeJson(citizenMemoryKey(input.citizen_id), [memory, ...memories].slice(0, 120));
}

function citizenMemoryKey(citizenId: string) {
  return `agentcity.${SESSION_VERSION}.memory.${citizenId}`;
}

function seedCitizenMemoryFiles(city: CityState) {
  for (const citizen of city.citizens) {
    const key = citizenMemoryKey(citizen.citizen_id);
    if (!readJson<Memory[]>(key)) {
      writeJson(key, [buildInitialMemory(citizen)]);
    }
  }
}

function buildInitialMemory(citizen: CitizenAgent): Memory {
  return {
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
  };
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

function ensureCitizenMemories(city: CityState | null, citizenId: string) {
  const key = citizenMemoryKey(citizenId);
  const memories = readJson<Memory[]>(key);
  if (memories) return memories;
  const citizen = city?.citizens.find((item) => item.citizen_id === citizenId);
  const seeded = citizen ? [buildInitialMemory(citizen)] : [];
  writeJson(key, seeded);
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

function normalizePlannedTaskKind(
  task: string,
  planned: PlayerTaskData["task_kind"] | undefined,
  hasTarget: boolean,
  hasLocation: boolean,
): PlayerTaskData["task_kind"] {
  const lower = task.toLowerCase();
  const isMovement = /\b(go|walk|head|travel|visit|come|take|bring|meet|move)\b/.test(lower);
  if (hasLocation && isMovement) return hasTarget ? "go_with_citizen" : "go_to_location";
  return planned ?? "open_task";
}

function inferMentionedCitizenIds(task: string, city: CityState, actorId: string) {
  const lower = normalizeText(task);
  return city.citizens
    .filter((citizen) => citizen.citizen_id !== actorId)
    .filter((citizen) => {
      const names = citizen.name.toLowerCase().split(/\s+/).filter(Boolean);
      return names.some((name) => lower.includes(name));
    })
    .map((citizen) => citizen.citizen_id);
}

function inferMentionedLocationId(task: string, city: CityState) {
  const lower = normalizeText(task);
  const matches = city.locations
    .map((location) => {
      const names = [
        location.name.toLowerCase(),
        location.type.toLowerCase().replaceAll("_", " "),
        ...location.name.toLowerCase().split(/\s+/),
      ];
      const index = Math.max(...names.map((name) => lower.lastIndexOf(name)).filter((value) => value >= 0));
      return { location, index: Number.isFinite(index) ? index : -1 };
    })
    .filter((item) => item.index >= 0)
    .sort((a, b) => b.index - a.index);
  return matches[0]?.location.location_id ?? null;
}

function memoryRelevantToCurrentTask(content: string, task: string, target?: CitizenAgent | null) {
  const taskTerms = taskKeywords(task, target);
  if (taskTerms.length === 0) return false;
  const normalized = normalizeText(content);
  return taskTerms.some((term) => normalized.includes(term));
}

function taskKeywords(task: string, target?: CitizenAgent | null) {
  const stop = new Set([
    "the",
    "and",
    "with",
    "that",
    "this",
    "there",
    "home",
    "same",
    "time",
    "together",
    "about",
    "please",
    "tell",
    "talk",
    "ask",
    "go",
    "to",
    "at",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "he",
    "she",
    "they",
    "you",
    "me",
    "my",
  ]);
  const targetNames = new Set((target?.name.toLowerCase().split(/\s+/) ?? []).filter(Boolean));
  return Array.from(new Set(normalizeText(task).split(/\s+/)))
    .filter((term) => term.length >= 3)
    .filter((term) => !stop.has(term))
    .filter((term) => !targetNames.has(term));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
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
