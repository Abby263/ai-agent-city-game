import type {
  AssignTaskPayload,
  CityEvent,
  CityMetrics,
  CityState,
  CitizenAgent,
  Conversation,
  ConversationImpact,
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
import { bondLabel, conversationImpact, emptyFeelings, evolveRelationship } from "@/lib/social";
import { acceptMeeting, cityMinute, meetingFor, meetingMinute, sociallyAvailable } from "./encounters";
import type { DecideSocial, EncounterContext } from "./encounters";
import { currentElection, liveElection, electionNotice, playerTurn, recordBallot, tallyElection } from "./elections";
import type { DecideElection, Election, ElectionDecision, ElectionDecisionRequest } from "./elections";
import { assertPlayerTextSafe } from "./safety";
import { isWeekend, routineStop, weekday, type RoutineContext } from "./routine";
import { calendarDay, calendarStartFor, realCityTime } from "./calendar";
import { dayWeather, weatherAt, type WeatherOverride } from "./weather";
import { weatherEffects } from "./life";
import { activeIncidents, applyScenario, type BondChange, type ScenarioRequest } from "./scenarios";
import { actionBlocked, actions as actionCatalog, performAction, type ActionId, type ActionOutcome } from "./actions";
import { addBeat, beatForConversation, beatForNews, startStory } from "./stories";
import { scenarioCatalog } from "./scenarios";
import type { LifeNews } from "./life";
import { bedRest, careNeeded, caregiverFor, ensureLife, gatheringFor, healthCap, lifeDay, lifeTick, recordMeal, relatives, shiftLife } from "./life";
import type { BondLookup, LifeFactory, LifeSink } from "./life";

const SESSION_VERSION = "v12";
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
  task_kind?:
    | "targeted_talk"
    | "greet_all"
    | "ask_all"
    | "self_answer"
    | "open_task"
    | "go_to_location"
    | "go_with_citizen";
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

type GenerateCognition = (
  request: SessionCognitionRequest,
) => Promise<SessionCognitionResponse>;
type GenerateTaskPlan = (
  request: SessionTaskPlanRequest,
) => Promise<SessionTaskPlanResponse>;

export function sessionMemoryEnabled() {
  return (
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_MEMORY_MODE !== "server"
  );
}

export function getSessionCity() {
  if (!sessionMemoryEnabled()) return null;
  return readJson<CityState>(CITY_KEY);
}

export function saveSessionCity(city: CityState) {
  if (!sessionMemoryEnabled()) return;
  city.revision = (getSessionCity()?.revision ?? 0) + 1;
  writeJson(CITY_KEY, normalizeCity(city));
}

export function seedSession(city: CityState) {
  if (!sessionMemoryEnabled()) return city;
  const existing = getSessionCity();
  if (existing) {
    // Join newly enabled YAML residents without erasing the player's world or journals.
    const known = new Set(existing.citizens.map((c) => c.citizen_id));
    const arrivals = city.citizens.filter((c) => !known.has(c.citizen_id));
    let natureChanged = false;
    for (const resident of existing.citizens) {
      const nature = city.citizens.find((c) => c.citizen_id === resident.citizen_id)?.personality.nature;
      if (nature && JSON.stringify(resident.personality.nature) !== JSON.stringify(nature)) {
        // Only profile-owned nature changes; preserve tasks, learned memories and current emotions.
        resident.personality = { ...resident.personality, nature: clone(nature) };
        natureChanged = true;
      }
    }
    // Bring older worlds up to date: new places, and life data (family, body, job) for existing residents.
    let lifeChanged = false;
    for (const place of city.locations) {
      const known = existing.locations.find((l) => l.location_id === place.location_id);
      if (!known) { existing.locations.push(clone(place)); lifeChanged = true; }
      else if (known.name !== place.name) { known.name = place.name; lifeChanged = true; }
    }
    if (existing.city_name !== city.city_name) { existing.city_name = city.city_name; lifeChanged = true; }
    for (const resident of existing.citizens) {
      if (resident.life) continue;
      const profile = city.citizens.find((c) => c.citizen_id === resident.citizen_id)?.life;
      resident.life = profile ? shiftLife(clone(profile), existing.clock.day - 1) : ensureLife(resident, existing.clock.day);
      lifeChanged = true;
    }
    if (!existing.calendar_start) { existing.calendar_start = calendarStartFor(existing.clock.day); lifeChanged = true; }
    if (!existing.policy.time_mode) { existing.policy.time_mode = city.policy.time_mode; lifeChanged = true; }
    existing.departed ??= [];
    existing.gatherings ??= [];
    existing.life_log ??= [];
    if (!arrivals.length) return natureChanged || lifeChanged ? saveAndReturn(existing) : existing;
    const newcomers = clone(arrivals);
    for (const person of newcomers) if (person.life) shiftLife(person.life, existing.clock.day - 1);
    existing.citizens.push(...newcomers);
    for (const citizen of arrivals) {
      ensureCitizenMemories(existing, citizen.citizen_id);
      addEvent(existing, { event_type: "citizen_arrived", actors: [citizen.citizen_id],
        location_id: citizen.home_location_id, description: `${citizen.name} has joined the neighborhood.`, priority: 2 });
    }
    ensureRelationships(existing);
    return saveAndReturn(existing);
  }

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

export function sessionRelationships(citizenId?: string) {
  const city = getSessionCity();
  const relationships = ensureRelationships(city);
  return relationships.filter(
    (relationship) => !citizenId || relationship.citizen_id === citizenId,
  );
}

export function sessionConversations(citizenId?: string) {
  const conversations = readJson<Conversation[]>(CONVERSATIONS_KEY) ?? [];
  const filtered = citizenId
    ? conversations.filter((conversation) =>
        conversation.actor_ids.includes(citizenId),
      )
    : conversations;
  return filtered
    .sort((a, b) => b.game_day - a.game_day || b.game_minute - a.game_minute)
    .slice(0, citizenId ? 50 : 80);
}

function clockLabel(minuteOfDay: number) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export async function sessionStart() {
  const city = requireSessionCity();
  if (
    !isLive(city) &&
    city.simulation_mode === "manual" &&
    activeTaskCitizens(city).length === 0
  ) {
    city.clock.running = false;
    addEvent(city, {
      event_type: "manual_mode_waiting",
      description:
        "Manual mode is waiting for the player to assign a task.",
      priority: 1,
    });
    return saveAndReturn(city);
  }
  city.clock.running = true;
  delete city.policy.autonomy_error;
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

export async function sessionTakeControl(citizenId: string | null) {
  const city = requireSessionCity();
  const election = liveElection(city);
  if (election?.waiting_for_player?.target_id !== citizenId && election) election.waiting_for_player = undefined;
  if (citizenId) {
    const citizen = findCitizen(city, citizenId);
    citizen.personality = {
      ...citizen.personality,
      player_task: null,
      companion_task: null,
    };
    citizen.current_activity = "Taking a moment";
    citizen.target_x = citizen.x;
    citizen.target_y = citizen.y;
  }
  city.policy = {
    ...city.policy,
    player_citizen_id: citizenId,
    player_destination: null,
  };
  addEvent(city, {
    event_type: "player_control",
    actors: citizenId ? [citizenId] : [],
    description: citizenId
      ? `You are now playing as ${findCitizen(city, citizenId).name}.`
      : "You returned control to the citizens.",
    priority: 1,
  });
  return saveAndReturn(city);
}

export async function sessionWalkTo(locationId: string) {
  const city = requireSessionCity();
  const citizen = findCitizen(city, String(city.policy.player_citizen_id));
  const location = city.locations.find(
    (item) => item.location_id === locationId,
  );
  if (!location) throw new Error("That destination is unavailable.");
  citizen.target_x = location.x + Math.floor(location.width / 2);
  citizen.target_y = location.y + Math.floor(location.height / 2);
  citizen.current_activity = `Walking to ${location.name}`;
  city.policy = { ...city.policy, player_destination: locationId };
  city.clock.running = true;
  return saveAndReturn(city);
}

export async function sessionSpeak(
  targetId: string,
  text: string,
  generate: GenerateCognition,
) {
  const city = requireSessionCity();
  const actor = findCitizen(city, String(city.policy.player_citizen_id));
  const target = findCitizen(city, targetId);
  if (
    actor === target ||
    actor.current_location_id !== target.current_location_id ||
    city.policy.player_destination
  ) {
    throw new Error("Meet this citizen at the same location before speaking.");
  }
  const utterance = text.trim();
  if (!utterance || utterance.length > 600)
    throw new Error("Write between 1 and 600 characters.");
  assertPlayerTextSafe(utterance);
  const response = await generate({
    city,
    actor_id: actor.citizen_id,
    target_id: targetId,
    require_conversation: true,
    task: "Respond to the player's spoken words.",
    player_utterance: utterance,
    prior_lines: recentChat(city, actor.citizen_id, targetId),
    observations: [],
    memories: [],
    private_memories: {
      [actor.citizen_id]: privateMemoryContext(actor, targetId),
      [targetId]: privateMemoryContext(target, actor.citizen_id),
    },
  });
  if (isStale(city)) return requireSessionCity();
  const source = {
    event_id: newId("speech"),
    location_id: actor.current_location_id,
  } as CityEvent;
  applyAutonomousCognition(city, actor, target, source, response);
  markPlayerChat(actor.citizen_id, targetId);
  actor.current_activity = `Talking with ${target.name}`;
  city.policy.player_lines = Number(city.policy.player_lines ?? 0) + 1;
  return saveAndReturn(city);
}

/** The last lines the two of them exchanged in the past two city hours, oldest first. */
function recentChat(city: CityState, a: string, b: string) {
  const now = city.clock.day * 1440 + city.clock.minute_of_day;
  return sessionConversations(a)
    .filter((c) => c.actor_ids.length === 2 && c.actor_ids.includes(b) && c.location_id === findCitizen(city, a).current_location_id
      && now >= c.game_day * 1440 + c.game_minute && now - (c.game_day * 1440 + c.game_minute) <= 120)
    // Storage is newest first, including ties. A stable time sort would keep tied exchanges backwards.
    .reverse()
    .flatMap((c) => c.transcript)
    .slice(-10);
}

/** Tags the newest exchange between the two as the player's own chat. */
function markPlayerChat(a: string, b: string) {
  const conversations = readJson<Conversation[]>(CONVERSATIONS_KEY) ?? [];
  // Stored newest first.
  const latest = conversations.find((c) => c.actor_ids.includes(a) && c.actor_ids.includes(b));
  if (!latest) return;
  latest.player_chat = true;
  writeJson(CONVERSATIONS_KEY, conversations);
}

export function exportSession() {
  const city = requireSessionCity();
  return {
    format: "agentcity-save",
    version: 1,
    city,
    relationships: ensureRelationships(city),
    conversations: sessionConversations(),
    memories: Object.fromEntries(
      city.citizens.map((citizen) => [
        citizen.citizen_id,
        readJson<Memory[]>(citizenMemoryKey(citizen.citizen_id)) ?? [],
      ]),
    ),
  };
}

export async function sessionSetMode(mode: SimulationMode) {
  const city = requireSessionCity();
  const previousMode = city.simulation_mode;
  city.simulation_mode = mode;
  city.policy = { ...city.policy, simulation_mode: mode };
  city.clock.running = mode === "autonomous" || isLive(city);
  delete city.policy.autonomy_error;
  if (previousMode !== mode) {
    addEvent(city, {
      event_type:
        mode === "manual" ? "manual_mode_enabled" : "autonomous_mode_enabled",
      description:
        mode === "manual"
          ? "Manual mode enabled. The city waits until the player assigns a task."
          : "Autonomous mode enabled. Residents resume daily life, conversations, and city reactions.",
      priority: 2,
    });
  }
  return saveAndReturn(city);
}

export async function sessionAssignTask(
  citizenId: string,
  payload: AssignTaskPayload,
  generateTaskPlan: GenerateTaskPlan,
) {
  const city = requireSessionCity();
  const citizen = findCitizen(city, citizenId);
  const task = payload.task.trim();
  assertPlayerTextSafe(task);
  const taskPlan = await planManualTask(
    city,
    citizen,
    task,
    generateTaskPlan,
  ).catch(() => null);
  if (isStale(city)) return requireSessionCity();
  if (!taskPlan) {
    blockManualTask(
      city,
      citizen,
      {
        task,
        status: "blocked",
        task_kind: "open_task",
        location_id: citizen.current_location_id,
        plan_summary:
          "The AI planner was unavailable, so the citizen could not decide how to act.",
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
  citizen.short_term_goals = [
    `Player task: ${task}`,
    ...withoutPlayerTask(citizen.short_term_goals),
  ].slice(0, 5);
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
    actors: [citizen.citizen_id, ...taskPlan.target_citizen_ids].filter(
      Boolean,
    ),
    description: task,
    payload: {
      task,
      target_citizen_id: taskPlan.target_citizen_id,
      target_citizen_ids: taskPlan.target_citizen_ids,
      task_kind: taskPlan.task_kind,
      reasoning_summary: taskPlan.reasoning_summary,
      plan_summary: taskPlan.player_visible_plan,
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
  if (
    city.simulation_mode === "manual" &&
    activeTaskCitizens(city).length === 0
  ) {
    city.clock.running = false;
  }
  return saveAndReturn(city);
}

export async function sessionTick(generateCognition: GenerateCognition, decideElection?: DecideElection, decideSocial?: DecideSocial) {
  const city = requireSessionCity();
  const checkedCognition: GenerateCognition = async (request) => {
    const response = await generateCognition(request);
    if (isStale(city)) throw new Error("This action was interrupted.");
    return response;
  };
  const live = isLive(city);
  const updateCitizens =
    city.simulation_mode === "manual" && !live
      ? activeTaskCitizens(city)
      : city.citizens;
  if (
    !live &&
    city.simulation_mode === "manual" &&
    updateCitizens.length === 0 &&
    !city.policy.player_destination
  ) {
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
      description: `${weekday(city.clock.day)}, day ${city.clock.day} begins in Nakameguro.${isWeekend(city.clock.day) ? " The weekend is here!" : ""}`,
      priority: 2,
    });
    lifeDay(city, lifeSink(city), bondLookup(city), lifeFactory(city));
    // Meguro Community Garden's produce restocks the market and the cafe every morning.
    const farming = city.citizens.some((c) => c.life?.job?.location_id === "loc_farm");
    for (const place of city.locations)
      if (["loc_market", "loc_restaurant"].includes(place.location_id))
        place.inventory.food = Math.min(120, Number(place.inventory.food ?? 0) + (farming ? 45 : 25));
  }

  refreshWeather(city, previousMinute);
  const producedEvents: CityEvent[] = [];
  for (const citizen of updateCitizens) {
    if (citizen.citizen_id === city.policy.player_citizen_id) continue;
    if (!city.citizens.includes(citizen)) continue;
    producedEvents.push(...updateCitizen(city, citizen, previousMinute));
  }
  // Bodies, feelings, work and illness carry on for everyone, including the player's citizen.
  const sink = lifeSink(city), bond = bondLookup(city);
  for (const citizen of city.citizens) {
    ensureLife(citizen, city.clock.day);
    lifeTick(city, citizen, sink, bond);
  }
  const player = city.citizens.find(
    (item) => item.citizen_id === city.policy.player_citizen_id,
  );
  if (player && typeof city.policy.player_destination === "string") {
    moveToward(player, player.target_x, player.target_y, city);
    if (player.x === player.target_x && player.y === player.target_y) {
      player.current_location_id = city.policy.player_destination;
      const visited = Array.isArray(city.policy.places_visited) ? (city.policy.places_visited as string[]) : [];
      city.policy.places_visited = [...new Set([...visited, player.current_location_id])];
      player.current_activity = `At ${locationName(city, player.current_location_id)}`;
      city.policy.player_destination = null;
      addEvent(city, {
        event_type: "citizen_arrived",
        actors: [player.citizen_id],
        location_id: player.current_location_id,
        description: `${player.name} arrived at ${locationName(city, player.current_location_id)}.`,
        priority: 1,
      });
    }
  }

  const cognitionCandidate = updateCitizens.find((citizen) => {
    if (citizen.citizen_id === city.policy.player_citizen_id) return false;
    const task = playerTask(citizen);
    return (
      task?.status === "active" && task.last_cognition_tick !== city.clock.tick
    );
  });
  const election = liveElection(city);
  if (cognitionCandidate && !(election && (election.phase === "voting" || city.clock.tick >= election.campaign_until_tick))) {
    await runTaskCognition(city, cognitionCandidate, checkedCognition).catch(
      () => {
        if (isStale(city)) return;
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
      },
    );
  } else if (city.simulation_mode === "autonomous" && liveElection(city)) {
    await advanceElection(city, generateCognition, decideElection);
  } else if (city.simulation_mode === "autonomous") {
      await advanceSocial(city, checkedCognition, decideSocial).catch(
        (error: unknown) => {
          if (isStale(city)) return;
          const reason = error instanceof Error
            ? error.name === "TimeoutError" ? "The AI conversation took too long. Resume Auto to retry." : error.message
            : "The AI conversation could not finish. Resume Auto to retry.";
          city.clock.running = false;
          city.policy.autonomy_error = reason;
          addEvent(city, {
            event_type: "agent_cognition_blocked",
            location_id: city.encounter?.location_id ?? null,
            actors: city.encounter ? [city.encounter.actor_id, city.encounter.target_id] : [],
            description: `Auto paused: ${reason}`,
            payload: {},
            priority: 3,
          });
        },
      );
  }

  if (isStale(city)) return requireSessionCity();
  if (
    !live &&
    city.simulation_mode === "manual" &&
    activeTaskCitizens(city).length === 0 &&
    !city.policy.player_destination
  ) {
    city.clock.running = false;
  }
  void producedEvents;
  return saveAndReturn(city);
}

function electionRequest(city: CityState, citizen: CitizenAgent, purpose: ElectionDecisionRequest["purpose"]): ElectionDecisionRequest {
  const event = currentElection(city)!;
  return {
    purpose, citizen, candidates: event.candidates,
    residents: city.citizens.filter((c) => purpose !== "campaign" || event.waiting_for_player?.candidate_id !== citizen.citizen_id || event.waiting_for_player?.target_id !== c.citizen_id)
      // A created election's candidates canvass voters, not each other.
      .filter((c) => purpose !== "campaign" || !event.auto || (event.voter_ids.includes(c.citizen_id) && !event.candidates.some((k) => k.citizen_id === c.citizen_id)))
      .map((c) => ({ citizen_id: c.citizen_id, name: c.name, location: locationName(city, c.current_location_id) })),
    memories: privateMemoryContext(citizen).slice(0, 24),
  };
}

export async function sessionStartElection(candidateId: string, rivalId: string, platform: string, decide: DecideElection) {
  const city = requireSessionCity();
  if (liveElection(city)) throw new Error("Finish or cancel the current election first.");
  const candidate = findCitizen(city, candidateId), rival = findCitizen(city, rivalId);
  if (candidateId === rivalId) throw new Error("Choose two different candidates.");
  if (!platform.trim() || platform.length > 800) throw new Error("Write a platform of 1 to 800 characters.");
  assertPlayerTextSafe(platform);
  if (playerTask(rival)?.status === "active") throw new Error("The rival has an active task. Finish it or choose another candidate.");
  const event: Election = {
    event_id: newId("election"), kind: "council_election", title: "Nakameguro neighbourhood association",
    phase: "campaign", candidates: [{ citizen_id: candidateId, name: candidate.name, platform: platform.trim() }, { citizen_id: rivalId, name: rival.name, platform: "" }],
    // Neighbourhood association: every resident votes.
    voter_ids: city.citizens.filter((c) => c.age >= 18).map((c) => c.citizen_id), campaign_until_tick: city.clock.tick + 32,
    ballots: [], campaign_turn: 0, campaign_log: [],
  };
  city.activities = [...(city.activities ?? []).slice(-4), event];
  const response = await decide(electionRequest(city, rival, "platform"));
  if (isStale(city)) return requireSessionCity();
  if (!response.platform.trim()) throw new Error("The rival did not publish a platform. Try again.");
  event.candidates[1].platform = response.platform;
  rival.mood = response.mood;
  candidate.personality = { ...candidate.personality, player_task: null, companion_task: null };
  candidate.short_term_goals = withoutPlayerTask(candidate.short_term_goals);
  city.policy.player_citizen_id = candidateId;
  city.policy.player_destination = null;
  candidate.target_x = candidate.x;
  candidate.target_y = candidate.y;
  city.simulation_mode = "autonomous";
  city.policy.simulation_mode = "autonomous";
  city.clock.running = true;
  addEvent(city, { event_type: "election_started", actors: [candidateId, rivalId], description: `${candidate.name} and ${rival.name} are running to chair the neighbourhood association.`, priority: 3 });
  return saveAndReturn(city);
}

export async function sessionElectionPhase(action: "vote" | "cancel") {
  const city = requireSessionCity(), event = liveElection(city);
  if (!event) throw new Error("No election is ongoing.");
  if (action === "vote" && event.phase !== "campaign") throw new Error("Voting is already open.");
  event.phase = action === "vote" ? "voting" : "cancelled";
  event.agenda = undefined;
  event.waiting_for_player = undefined;
  event.error = undefined;
  city.clock.running = false;
  addEvent(city, { event_type: `election_${event.phase}`, description: action === "vote" ? "Campaigning has ended. Private ballots are open." : "The election was cancelled. No winner was declared.", priority: 3 });
  return saveAndReturn(city);
}

function applyBallot(city: CityState, voterId: string, voteFor: string | null, reason: string, source: "agent" | "player") {
  const event = currentElection(city);
  if (!event) throw new Error("No election is ongoing.");
  const updated = recordBallot(event, { voter_id: voterId, vote_for: voteFor, reason, source });
  city.activities = city.activities!.map((e) => e.event_id === event.event_id ? updated : e);
  addMemory({ citizen_id: voterId, kind: "episodic", content: `My private ballot: ${voteFor ? updated.candidates.find((c) => c.citizen_id === voteFor)?.name : "abstain"}. ${reason}`, importance: 0.8, salience: 0.8, related_citizen_id: voteFor, extra: { election_id: event.event_id } });
  if (updated.phase === "complete") {
    let result = tallyElection(updated)!;
    if (result.tied && updated.auto) {
      // Japanese elections settle a tie by drawing lots; a created election always ends with a winner.
      const leaders = result.counts.filter((c) => c.votes === Math.max(...result.counts.map((x) => x.votes)));
      updated.lot_winner = leaders[Math.floor(Math.random() * leaders.length)].citizen_id;
      result = tallyElection(updated)!;
    }
    const first = (name: string) => name.split(" ")[0];
    const description = result.by_lot && result.winner
      ? `${result.counts.map((c) => first(c.name)).join(" and ")} tied ${result.winner.votes}–${result.winner.votes}. ${result.winner.name} won the neighbourhood election by drawing lots.`
      : result.winner ? `${result.winner.name} won the neighbourhood-association election with ${result.winner.votes} votes.` : result.tied ? "The neighbourhood election ended in a tie. No winner was declared." : "Everyone abstained. No winner was declared.";
    const resultEvent = addEvent(city, { event_type: "election_result", description, actors: updated.candidates.map((c) => c.citizen_id), priority: 3 });
    for (const voter of updated.voter_ids) addMemory({ citizen_id: voter, kind: "episodic", content: description, importance: 0.85, salience: 0.85, related_citizen_id: result.winner?.citizen_id ?? null, extra: { election_id: event.event_id, source: "public_result" } });
    if (updated.story_id) {
      const score = result.counts.map((c) => `${first(c.name)} ${c.votes}`).join(" – ");
      addBeat(city, updated.story_id, { icon: result.winner ? "🏆" : "🤝", text: `${description} Final count: ${score}${result.abstentions ? `, ${result.abstentions} abstained` : ""}.` });
      city.life_log = [...(city.life_log ?? []), { id: resultEvent.event_id, day: city.clock.day, minute: city.clock.minute_of_day, kind: "election",
        icon: "🗳️", headline: description, actors: updated.candidates.map((c) => c.citizen_id) }].slice(-200);
    }
    if (!updated.auto) city.clock.running = false;
  }
}

/** Create → election: two AI-run candidates, a short campaign you can watch, private ballots, a winner. */
export async function sessionStartElectionAuto(firstId: string, secondId: string, decide: DecideElection) {
  const city = requireSessionCity();
  if (liveElection(city)) throw new Error("An election is already running. Wait for the result first.");
  if (firstId === secondId) throw new Error("Choose two different candidates.");
  const [a, b] = [findCitizen(city, firstId), findCitizen(city, secondId)];
  if (![a, b].every((c) => c.age >= 18)) throw new Error("Candidates must be residents aged 18 or over.");
  const voters = city.citizens.filter((c) => c.age >= 18).map((c) => c.citizen_id);
  const event: Election = {
    event_id: newId("election"), kind: "council_election", title: "Nakameguro neighbourhood association (chōnaikai)", phase: "campaign",
    candidates: [{ citizen_id: a.citizen_id, name: a.name, platform: "" }, { citizen_id: b.citizen_id, name: b.name, platform: "" }],
    voter_ids: voters, campaign_until_tick: city.clock.tick + 9999, ballots: [], campaign_turn: 0, campaign_log: [], auto: true,
  };
  city.activities = [...(city.activities ?? []).slice(-4), event];
  const platforms = await Promise.all([a, b].map((c) => decide(electionRequest(city, c, "platform"))));
  if (isStale(city)) return requireSessionCity();
  platforms.forEach((p, i) => { event.candidates[i].platform = p.platform.trim() || "Make Nakameguro better for everyone."; [a, b][i].mood = p.mood || [a, b][i].mood; });
  const story = startStory(city, {
    id: newId("story"), kind: "election", icon: "🗳️", title: `Neighbourhood election: ${a.name.split(" ")[0]} vs ${b.name.split(" ")[0]}`,
    actors: [...new Set([a.citizen_id, b.citizen_id, ...voters])], focus_ids: [a.citizen_id, b.citizen_id], location_id: "loc_city_hall",
    first: { icon: "🗳️", text: `${a.name} and ${b.name} are running to chair the neighbourhood association.` }, length: 48 * 60,
  });
  event.story_id = story.id;
  for (const c of event.candidates) addBeat(city, story.id, { icon: "📣", text: `${c.name.split(" ")[0]}'s platform: “${c.platform.slice(0, 160)}”` });
  addEvent(city, { event_type: "election_started", actors: [a.citizen_id, b.citizen_id], description: `${a.name} and ${b.name} are running to chair the neighbourhood association.`, priority: 3 });
  return saveAndReturn(city);
}

/** Campaigning ends and every resident casts a private ballot (called by the shell, or by a candidate you play). */
export async function sessionOpenBallots() {
  const city = requireSessionCity();
  const event = liveElection(city);
  if (!event?.auto || event.phase !== "campaign") throw new Error("There is no campaign to close.");
  event.phase = "voting";
  addBeat(city, event.story_id ?? "", { icon: "🗳️", text: "Campaigning is over. Every resident is casting a private ballot." });
  addEvent(city, { event_type: "election_voting", description: "Campaigning has ended. Residents are casting private ballots.", priority: 3 });
  return saveAndReturn(city);
}

/** Before you vote, a candidate comes over to hear your questions (they want your vote, after all). */
export async function sessionCallCandidate(candidateId: string) {
  const city = requireSessionCity();
  const event = liveElection(city), player = String(city.policy.player_citizen_id ?? "");
  if (!event?.candidates.some((c) => c.citizen_id === candidateId)) throw new Error("That resident isn't a candidate.");
  const [candidate, you] = [findCitizen(city, candidateId), findCitizen(city, player)];
  if (candidate.current_location_id !== you.current_location_id) {
    candidate.current_location_id = you.current_location_id;
    candidate.x = candidate.target_x = you.x + 1;
    candidate.y = candidate.target_y = you.y;
  }
  candidate.current_activity = `Campaigning: talking with ${you.name}`;
  if (event.story_id) addBeat(city, event.story_id, { icon: "🙋", text: `${candidate.name.split(" ")[0]} came over to answer your questions, ${you.name.split(" ")[0]}.` });
  return saveAndReturn(city);
}

/** One step of an election created from Create: a campaign conversation, or everyone's private vote. */
export async function sessionAdvanceAutoElection(generate: GenerateCognition, decide: DecideElection) {
  const city = requireSessionCity();
  const event = liveElection(city);
  if (!event?.auto) return city;
  const storyId = event.story_id ?? "";
  if (event.phase === "campaign" && event.campaign_turn >= 2) {
    if (playerTurn(city)?.waiting) return city;
    return sessionOpenBallots();
  }
  const player = city.policy.player_citizen_id as string | null | undefined;
  const first = (c: CitizenAgent) => c.name.split(" ")[0];
  if (event.phase === "campaign") {
    const candidate = findCitizen(city, event.candidates[event.campaign_turn % event.candidates.length].citizen_id);
    if (candidate.citizen_id === player) {
      // You speak for yourself: the AI never campaigns in your character's voice.
      event.campaign_turn++;
      addBeat(city, storyId, { icon: "📣", text: `You're ${first(candidate)}: walk up to voters and make your case in Talk. Ballots open after the other candidate's turn.` });
      return saveAndReturn(city);
    }
    const decision = await decide(electionRequest(city, candidate, "campaign"));
    if (isStale(city)) return requireSessionCity();
    event.campaign_turn++;
    const canvassed = new Set(event.campaign_log.map((l) => l.target_id));
    const voters = event.voter_ids.filter((id) => id !== candidate.citizen_id && !event.candidates.some((c) => c.citizen_id === id)).map((id) => findCitizen(city, id));
    // With only two campaign turns, a candidate who "takes a break" still goes to see a voter, nearest first.
    const target = (decision.target_id ? voters.find((c) => c.citizen_id === decision.target_id) : undefined)
      ?? voters.filter((c) => !canvassed.has(c.citizen_id) && c.citizen_id !== player).sort((a, b) => Number(b.current_location_id === candidate.current_location_id) - Number(a.current_location_id === candidate.current_location_id))[0];
    if (!target) {
      addBeat(city, storyId, { icon: "📝", text: `${first(candidate)} spent the time polishing their speech instead of campaigning.` });
      return saveAndReturn(city);
    }
    event.campaign_log.push({ candidate_id: candidate.citizen_id, target_id: target.citizen_id, conversation_id: "" });
    candidate.current_location_id = target.current_location_id;
    candidate.x = candidate.target_x = target.x;
    candidate.y = candidate.target_y = target.y;
    if (target.citizen_id === player) {
      addBeat(city, storyId, { icon: "🙋", text: `${first(candidate)} came to find you, ${first(target)}, to ask for your vote. Answer them in Talk.` });
      return saveAndReturn(city);
    }
    addBeat(city, storyId, { icon: "🚶", text: `${first(candidate)} goes to win over ${first(target)}${decision.target_id === target.citizen_id && decision.intention ? `: ${decision.intention}` : "."}` });
    const response = await generate({ city, actor_id: candidate.citizen_id, target_id: target.citizen_id, require_conversation: true,
      task: `Ask ${target.name} for their vote in the neighbourhood election.`,
      observations: [...electionNotice(city), `You are ${candidate.name}, one of the two candidates. Say that you're running, pitch your own platform in your own words and ask ${first(target)} for their vote.`,
        `Your private campaign intention: ${decision.intention || decision.reason}`], memories: [],
      private_memories: { [candidate.citizen_id]: privateMemoryContext(candidate), [target.citizen_id]: privateMemoryContext(target) } });
    if (isStale(city)) return requireSessionCity();
    applyAutonomousCognition(city, candidate, target, { event_id: event.event_id, location_id: target.current_location_id } as CityEvent, response);
    return saveAndReturn(city);
  }
  // Bound concurrency; failed decisions are missing ballots, never invented abstentions.
  // Your own ballot is yours: everyone else votes, then the election waits for you.
  const voters = event.voter_ids.filter((id) => id !== player && !event.ballots.some((b) => b.voter_id === id));
  if (!voters.length) return city;
  const decisions: Array<ElectionDecision | null> = [];
  for (let i = 0; i < voters.length; i += 8) {
    if (isStale(city)) return requireSessionCity();
    decisions.push(...await Promise.all(voters.slice(i, i + 8).map((id) => decide(electionRequest(city, findCitizen(city, id), "vote")).catch(() => null))));
    if (decisions.slice(i).some((d) => !d)) break;
  }
  if (isStale(city)) return requireSessionCity();
  let missing = 0;
  voters.forEach((id, i) => {
    const d = decisions[i];
    if (!d || (d.vote_for !== null && !event.candidates.some((c) => c.citizen_id === d.vote_for))) { missing++; return; }
    applyBallot(city, id, d.vote_for, d.reason, "agent");
    if (d.mood) findCitizen(city, id).mood = d.mood;
  });
  const pending = liveElection(city);
  if (pending && missing) {
    pending.error = `${missing} ballots are still waiting on the AI service. No votes were invented. Retry when the service is ready.`;
  } else if (player && pending) addBeat(city, storyId, { icon: "🗳️", text: `Everyone else has voted. It's down to your ballot, ${first(findCitizen(city, player))}.` });
  return saveAndReturn(city);
}

export async function sessionCastVote(voteFor: string | null) {
  const city = requireSessionCity();
  const voter = String(city.policy.player_citizen_id ?? "");
  findCitizen(city, voter);
  applyBallot(city, voter, voteFor, voteFor ? "I made up my own mind after hearing the candidates." : "Neither candidate won me over.", "player");
  return saveAndReturn(city);
}

export async function sessionNextBallot(decide: DecideElection) {
  const city = requireSessionCity();
  if (currentElection(city)?.phase !== "voting") throw new Error("Voting is not open.");
  await advanceElection(city, async () => { throw new Error("No campaign speech during voting."); }, decide);
  if (isStale(city)) return requireSessionCity();
  return saveAndReturn(city);
}

async function advanceElection(city: CityState, generate: GenerateCognition, decide?: DecideElection) {
  const event = liveElection(city);
  if (!event) return;
  try {
    if (!decide) throw new Error("Election intelligence is not connected.");
    event.error = undefined;
    if (event.phase === "campaign" && city.clock.tick >= event.campaign_until_tick) {
      event.phase = "voting";
      event.agenda = undefined;
      event.waiting_for_player = undefined;
      addEvent(city, { event_type: "election_voting", description: "Campaigning has ended. Residents are casting private ballots.", priority: 3 });
    }
    if (event.phase === "voting") {
      const id = event.voter_ids.find((id) => id !== city.policy.player_citizen_id && !event.ballots.some((b) => b.voter_id === id));
      if (!id) { city.clock.running = false; return; }
      const voter = findCitizen(city, id);
      const decision = await decide(electionRequest(city, voter, "vote"));
      if (isStale(city)) return;
      applyBallot(city, id, decision.vote_for, decision.reason, "agent");
      voter.mood = decision.mood;
      return;
    }
    if (city.clock.tick % 3 !== 0) return;
    const candidates = event.candidates.filter((c) => c.citizen_id !== city.policy.player_citizen_id && playerTask(findCitizen(city, c.citizen_id))?.status !== "active");
    if (!candidates.length) return;
    if (event.agenda?.candidate_id === city.policy.player_citizen_id) event.agenda = undefined;
    if (!event.agenda) {
      const candidate = findCitizen(city, candidates[event.campaign_turn % candidates.length].citizen_id);
      const decision = await decide(electionRequest(city, candidate, "campaign"));
      if (isStale(city)) return;
      event.campaign_turn++;
      if (!decision.target_id) return;
      const target = findCitizen(city, decision.target_id);
      if (target === candidate) throw new Error("A candidate cannot approach themselves.");
      event.agenda = { candidate_id: candidate.citizen_id, target_id: target.citizen_id, intention: decision.intention || decision.reason };
      candidate.current_thought = decision.reason;
      candidate.mood = decision.mood;
      addEvent(city, { event_type: "campaign_plan", actors: [candidate.citizen_id, target.citizen_id], description: `${candidate.name} plans to approach ${target.name}: ${event.agenda.intention}`, priority: 2 });
      return;
    }
    const actor = findCitizen(city, event.agenda.candidate_id), target = findCitizen(city, event.agenda.target_id);
    if (!nearCitizen(actor, target) || actor.current_location_id !== target.current_location_id) return;
    // Never invent the player's reply or hold up the rival's whole campaign.
    if (target.citizen_id === city.policy.player_citizen_id) {
      event.waiting_for_player = { ...event.agenda };
      event.agenda = undefined;
      addEvent(city, { event_type: "campaign_approach", actors: [actor.citizen_id, target.citizen_id], description: `${actor.name} would like to discuss the election with ${target.name}.`, priority: 2 });
      return;
    }
    const response = await generate({ city, actor_id: actor.citizen_id, target_id: target.citizen_id, require_conversation: true,
      task: `Discuss the neighbourhood election with ${target.name}.`, observations: [...electionNotice(city), `Your private campaign intention: ${event.agenda.intention}`], memories: [],
      private_memories: { [actor.citizen_id]: privateMemoryContext(actor), [target.citizen_id]: privateMemoryContext(target) } });
    if (isStale(city)) return;
    applyAutonomousCognition(city, actor, target, { event_id: event.event_id, location_id: actor.current_location_id } as CityEvent, response);
    event.agenda = undefined;
  } catch (error) {
    if (isStale(city)) return;
    event.error = error instanceof Error ? error.message : "The agent could not decide. No vote or dialogue was invented.";
    city.clock.running = false;
  }
}

export async function sessionTriggerEvent(payload: TriggerEventPayload) {
  const city = requireSessionCity();
  const locationId =
    payload.location_id ?? defaultEventLocation(payload.event_type);
  const severity = payload.severity ?? "medium";
  const multiplier = severity === "high" ? 1.45 : severity === "low" ? 0.6 : 1;
  let description = "A city event changes everyone's day.";
  const actors: string[] = [];

  if (payload.event_type === "flu_outbreak") {
    description = "A flu outbreak starts spreading around Nakameguro.";
    for (const citizen of city.citizens) {
      actors.push(citizen.citizen_id);
      citizen.health = clamp(citizen.health - 28 * multiplier);
      citizen.stress = clamp(citizen.stress + 10 * multiplier);
      addMemory({
        citizen_id: citizen.citizen_id,
        kind: "episodic",
        content:
          "A flu outbreak is spreading through the offices and trains, and everyone is watching who gets sick.",
        importance: 0.82,
        salience: 0.86,
        related_citizen_id: null,
        extra: { source: "flu_outbreak" },
      });
    }
  } else if (payload.event_type === "school_exam") {
    description = "Qualification exam day: everyone studying for a certificate sits their test.";
    for (const citizen of city.citizens) {
      actors.push(citizen.citizen_id);
      citizen.stress = clamp(citizen.stress + 10 * multiplier);
    }
  } else if (payload.event_type === "city_festival") {
    description =
      "A city festival begins at the park and gives everyone a reason to meet.";
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
    description =
      "A food shortage hits the market and people talk about bringing lunch from home.";
    for (const citizen of city.citizens) {
      citizen.hunger = clamp(citizen.hunger + 8 * multiplier);
    }
  } else if (payload.event_type === "bank_policy_change") {
    description =
      "The bank changes youth savings rules and families start talking about money.";
  } else if (payload.event_type === "power_outage") {
    description = "A power outage interrupts morning routines across Nakameguro.";
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
    description: changed
      ? `The mayor changed city policy: ${changed}.`
      : "The mayor reviewed city policy.",
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
  const validCitizenIds = new Set(
    city.citizens
      .filter((item) => item.citizen_id !== citizen.citizen_id)
      .map((item) => item.citizen_id),
  );
  const validLocationIds = new Set(
    city.locations.map((location) => location.location_id),
  );
  const inferredTargetIds = inferMentionedCitizenIds(
    task,
    city,
    citizen.citizen_id,
  );
  const unavailableMentionedNames = inferUnavailableMentionedPersonNames(
    task,
    city,
  );
  const targetIds = Array.from(
    new Set(
      [
        ...(unavailableMentionedNames.length > 0 &&
        inferredTargetIds.length === 0
          ? []
          : plan.target_citizen_ids),
        ...inferredTargetIds,
      ].filter((targetId) => validCitizenIds.has(targetId)),
    ),
  );
  const firstTarget = targetIds[0]
    ? city.citizens.find((item) => item.citizen_id === targetIds[0])
    : null;
  const inferredLocationId = inferMentionedLocationId(task, city);
  const locationId =
    (plan.location_id && validLocationIds.has(plan.location_id)
      ? plan.location_id
      : null) ??
    inferredLocationId ??
    firstTarget?.current_location_id ??
    citizen.current_location_id;
  const taskKind =
    unavailableMentionedNames.length > 0 && inferredTargetIds.length === 0
      ? "open_task"
      : normalizePlannedTaskKind(
          task,
          plan.task_kind,
          Boolean(firstTarget),
          Boolean(inferredLocationId),
        );
  const visiblePlan =
    unavailableMentionedNames.length > 0 && inferredTargetIds.length === 0
      ? `${citizen.name} needs to clarify the task because ${unavailableMentionedNames.join(", ")} is not currently in Nakameguro.`
      : plan.player_visible_plan ||
        `${citizen.name} is deciding how to handle: ${task}`;

  return {
    task_kind: taskKind,
    target_citizen_id: firstTarget?.citizen_id ?? null,
    target_citizen_ids: targetIds,
    location_id: locationId,
    reasoning_summary: plan.reasoning_summary,
    player_visible_plan: visiblePlan,
  };
}

function firstNames(city: CityState) {
  return Object.fromEntries(city.citizens.map((c) => [c.citizen_id, c.name.split(" ")[0]]));
}

function lifeSink(city: CityState): LifeSink {
  return (news) => {
    beatForNews(city, news);
    const event = addEvent(city, { event_type: `life_${news.kind}`, description: news.headline, actors: news.actors,
      location_id: news.location_id ?? null, priority: news.priority ?? 2 });
    for (const memory of news.memories ?? [])
      addMemory({ citizen_id: memory.citizen_id, kind: "episodic", content: memory.content, importance: memory.importance, salience: memory.importance,
        related_citizen_id: memory.related_citizen_id ?? null, source_event_id: event.event_id, extra: { source: `life_${news.kind}` } });
    if (["medication", "payday"].includes(news.kind)) return;
    city.life_log = [...(city.life_log ?? []), { id: event.event_id, day: city.clock.day, minute: city.clock.minute_of_day, kind: news.kind,
      icon: news.icon, headline: news.headline, actors: news.actors }].slice(-200);
  };
}

function bondLookup(city: CityState): BondLookup {
  const bonds = new Map(ensureRelationships(city).map((r) => [`${r.citizen_id}>${r.other_citizen_id}`, r]));
  return (from, to) => bonds.get(`${from}>${to}`);
}

function lifeFactory(city: CityState): LifeFactory {
  return {
    newCitizen: (baby) => {
      city.citizens.push(baby);
      ensureCitizenMemories(city, baby.citizen_id);
      ensureRelationships(city);
    },
    departed: (person) => {
      city.departed = [...(city.departed ?? []), person];
    },
  };
}

/** Live mode follows real Tokyo time; fast mode runs the clock as quickly as the player likes. */
export const isLive = (city: CityState) => city.policy.time_mode === "live";

export async function sessionSetTimeMode(mode: "live" | "fast") {
  const city = requireSessionCity();
  city.policy.time_mode = mode;
  if (mode === "live") city.clock.running = true;
  addEvent(city, { event_type: "time_mode", description: mode === "live" ? "Nakameguro now follows real Tokyo time." : "Fast-forward: time runs faster than real life.", priority: 1 });
  return saveAndReturn(city);
}

/** How far city time trails real Tokyo time, in minutes (negative when ahead after fast-forwarding). */
export function minutesBehindRealTime(city: CityState, now = new Date()) {
  const real = realCityTime(city.calendar_start ?? calendarStartFor(city.clock.day), now);
  return (real.day - city.clock.day) * 1440 + real.minute - city.clock.minute_of_day;
}

/** Jumps a live world forward to real Tokyo time, living through each missed day without AI calls. */
export async function sessionSyncToRealTime(now = new Date()) {
  const city = requireSessionCity();
  if (!isLive(city)) return city;
  const behind = minutesBehindRealTime(city, now);
  if (behind < 15) return city;
  const real = realCityTime(city.calendar_start!, now);
  const days = real.day - city.clock.day;
  const sink = lifeSink(city);
  for (let d = 0; d < Math.min(days, 400); d++) {
    city.clock.day += 1;
    city.clock.minute_of_day = 0;
    lifeDay(city, sink, bondLookup(city), lifeFactory(city));
    for (const place of city.locations)
      if (["loc_market", "loc_restaurant"].includes(place.location_id)) place.inventory.food = Math.min(120, Number(place.inventory.food ?? 0) + 45);
  }
  const previous = city.clock.minute_of_day;
  city.clock.day = real.day;
  city.clock.minute_of_day = Math.floor(real.minute / 15) * 15;
  city.clock.tick += Math.round(behind / 15);
  city.encounter = null;
  refreshWeather(city, days > 0 ? 1440 : previous);
  // Everyone is wherever their day would have taken them by now, fed and rested enough.
  for (const citizen of city.citizens) {
    if (citizen.citizen_id === city.policy.player_citizen_id) continue;
    const [locationId, activity] = desiredLocation(city, citizen);
    const place = city.locations.find((l) => l.location_id === locationId);
    if (place) {
      citizen.x = citizen.target_x = place.x + Math.floor(place.width / 2);
      citizen.y = citizen.target_y = place.y + Math.floor(place.height / 2);
      citizen.current_location_id = locationId;
    }
    citizen.current_activity = activity;
    citizen.hunger = Math.min(citizen.hunger, 45);
    citizen.energy = Math.max(citizen.energy, 60);
  }
  const hours = Math.round(behind / 60);
  addEvent(city, { event_type: "time_skip", description: `Caught up with real Tokyo time: ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`} passed while you were away.`, priority: 2 });
  if (hours >= 12) sink({ kind: "time_skip", icon: "⏩", headline: `While you were away, ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`} passed in Nakameguro.`, actors: [], priority: 2 });
  return saveAndReturn(city);
}

/** A conversation opportunity between live ticks, so the city keeps talking in real time. */
export async function sessionSocialBeat(generateCognition: GenerateCognition, decideSocial?: DecideSocial) {
  const city = requireSessionCity();
  if (city.simulation_mode !== "autonomous" || !city.clock.running || liveElection(city)) return city;
  const checked: GenerateCognition = async (request) => {
    const response = await generateCognition(request);
    if (isStale(city)) throw new Error("This action was interrupted.");
    return response;
  };
  try {
    await advanceSocial(city, checked, decideSocial, true);
  } catch (error) {
    if (isStale(city)) return requireSessionCity();
    city.clock.running = false;
    city.policy.autonomy_error = error instanceof Error ? error.message : "The AI conversation could not finish.";
  }
  if (isStale(city)) return requireSessionCity();
  return saveAndReturn(city);
}

/** "Sunday 27 Sep 2026, 14:00 in Nakameguro. Weather: Rain, 21°C", for AI prompts. */
export function describeNow(city: CityState) {
  const day = calendarDay(city.calendar_start ?? calendarStartFor(city.clock.day), city.clock.day);
  const clock = `${String(Math.floor(city.clock.minute_of_day / 60)).padStart(2, "0")}:${String(city.clock.minute_of_day % 60).padStart(2, "0")}`;
  const w = city.weather;
  return `${weekday(city.clock.day)} ${day.dayOfMonth}/${day.month}/${day.year}, ${clock} in ${city.city_name}, Tokyo${day.holiday ? ` (${day.holiday})` : ""}${w ? `. Weather: ${w.label}, ${Math.round(w.temp_c)}°C${w.alert ? `. ${w.alert.text}` : ""}` : ""}`;
}

export function routineContext(city: CityState): RoutineContext {
  const today = calendarDay(city.calendar_start ?? calendarStartFor(city.clock.day), city.clock.day);
  const weekend = isWeekend(city.clock.day);
  return {
    schoolOpen: !weekend && !today.holiday && !today.schoolBreak && city.weather?.condition !== "typhoon",
    publicHoliday: Boolean(today.holiday),
    weather: city.weather,
    evacuating: (city.evacuation_until ?? 0) > cityMinute(city),
    closed: activeIncidents(city, cityMinute(city)).filter((i) => i.kind === "fire").map((i) => i.location_id),
  };
}

/** Player-created situations: the world changes now, and residents talk it through in Auto. */
export async function sessionCreateSituation(request: ScenarioRequest, generate?: GenerateCognition) {
  const city = requireSessionCity();
  city.incidents = activeIncidents(city, cityMinute(city));
  const news: LifeNews[] = [];
  const sink = lifeSink(city);
  const result = applyScenario(city, request, { sink: (item) => { news.push(item); sink(item); }, adjustBonds: (changes) => adjustBonds(city, changes), cityMinute: cityMinute(city) });
  const spec = scenarioCatalog.find((s) => s.kind === request.kind);
  const encounter = city.encounter;
  const actors = [...new Set([...news.flatMap((n) => n.actors), ...(encounter ? [encounter.actor_id, encounter.target_id] : []), ...(request.citizen_ids ?? []).slice(0, spec?.needs.includes("pair") ? 2 : spec?.needs.includes("person") ? 1 : 0)])];
  const story = startStory(city, {
    id: newId("story"), kind: request.kind, icon: spec?.icon ?? "✨", title: result.headline, actors: actors.slice(0, 12),
    focus_ids: [result.focus_id, encounter?.actor_id, encounter?.target_id].filter((id): id is string => Boolean(id)),
    location_id: request.location_id ?? encounter?.location_id ?? null,
    first: { icon: spec?.icon ?? "✨", text: news[0]?.headline ?? result.headline },
  });
  city.encounter = null;
  const saved = saveAndReturn(city);
  if (!encounter || !generate) return { city: saved, result, story_id: story.id, talked: false };
  // The people involved react right away instead of waiting for the next tick.
  const live = requireSessionCity();
  try {
    const actor = findCitizen(live, encounter.actor_id), target = findCitizen(live, encounter.target_id);
    actor.current_location_id = target.current_location_id;
    actor.x = actor.target_x = target.x;
    actor.y = actor.target_y = target.y;
    const event = addEvent(live, { event_type: "social_opportunity", actors: [actor.citizen_id, target.citizen_id], location_id: target.current_location_id,
      description: encounter.reason, payload: { topic: encounter.topic, kind: "chance" }, priority: 2 });
    addBeat(live, story.id, { icon: "🚶", text: `${actor.name.split(" ")[0]} goes to ${target.name.split(" ")[0]} to talk about ${encounter.topic}.` });
    await runAutonomousCognition(live, event, generate);
    if (isStale(live)) return { city: requireSessionCity(), result, story_id: story.id, talked: false };
    return { city: saveAndReturn(live), result, story_id: story.id, talked: true };
  } catch (error) {
    return { city: isStale(live) ? requireSessionCity() : saved, result, story_id: story.id, talked: false, error: error instanceof Error ? error.message : "They could not talk right now." };
  }
}

/**
 * Any resident can do something to any other: the actor goes to the target, the action takes effect
 * at once, then the target reacts in their own AI-generated words (only the reply when the player acts).
 */
/** A choice made in "What happens next?": continue that story, or start one so the thread stays tracked. */
export type ActionThread = { storyId?: string; track?: boolean };

export async function sessionPerformAction(actorId: string, targetId: string, actionId: ActionId, note: string, generate: GenerateCognition, thread: ActionThread = {}):
  Promise<{ city: CityState; outcome: ActionOutcome; talked: boolean; error?: string }> {
  const city = requireSessionCity();
  const actor = findCitizen(city, actorId), target = findCitizen(city, targetId);
  const blocked = actionBlocked(city, actor, target, actionId);
  if (blocked) throw new Error(blocked);
  const text = note.trim().slice(0, 300);
  if (text) assertPlayerTextSafe(text);
  actor.current_location_id = target.current_location_id;
  actor.x = actor.target_x = target.x;
  actor.y = actor.target_y = target.y;
  actor.current_activity = `With ${target.name}`;
  if (actorId === city.policy.player_citizen_id) city.policy.player_destination = null;
  if (city.encounter && [actorId, targetId].some((id) => [city.encounter!.actor_id, city.encounter!.target_id].includes(id))) city.encounter = null;
  const outcome = performAction(city, actor, target, actionId, { sink: lifeSink(city), adjustBonds: (changes) => adjustBonds(city, changes), bond: bondLookup(city) }, text);
  const spec = actionCatalog.find((a) => a.id === actionId)!;
  const story = thread.storyId ? city.stories?.find((s) => s.id === thread.storyId) : undefined;
  if (story) {
    story.actors = [...new Set([...story.actors, actorId, targetId])];
    story.ends = Math.max(story.ends, cityMinute(city) + 12 * 60);
    addBeat(city, story.id, { icon: "👉", text: `You chose: ${outcome.headline}` });
    story.latest = `action_${actionId}`;
  } else if (thread.track || spec.group === "love" || spec.group === "conflict" || actionId === "gift") {
    const onlookers = city.citizens.filter((c) => c !== actor && c !== target && c.current_location_id === target.current_location_id).map((c) => c.citizen_id);
    startStory(city, { id: newId("story"), kind: `action_${actionId}`, icon: spec.icon, title: outcome.headline, actors: [actorId, targetId, ...onlookers].slice(0, 10),
      focus_ids: [actorId, targetId], location_id: target.current_location_id, first: { icon: spec.icon, text: outcome.headline }, length: 24 * 60 });
  }
  const saved = saveAndReturn(city);
  if (actor.age < 3 || target.age < 3) return { city: saved, outcome, talked: false };
  const live = requireSessionCity();
  const liveActor = findCitizen(live, actorId), liveTarget = findCitizen(live, targetId);
  try {
    if (actorId === live.policy.player_citizen_id) {
      const response = await generate({ city: live, actor_id: actorId, target_id: targetId, require_conversation: true, task: "Respond to the player's action and words.",
        player_utterance: outcome.utterance, prior_lines: recentChat(live, actorId, targetId), observations: [outcome.reason], memories: [],
        private_memories: { [actorId]: privateMemoryContext(liveActor, targetId), [targetId]: privateMemoryContext(liveTarget, actorId) } });
      if (isStale(live)) return { city: requireSessionCity(), outcome, talked: false };
      applyAutonomousCognition(live, liveActor, liveTarget, { event_id: newId("action"), location_id: liveTarget.current_location_id } as CityEvent, response);
      markPlayerChat(actorId, targetId);
      live.policy.player_lines = Number(live.policy.player_lines ?? 0) + 1;
    } else {
      const event = addEvent(live, { event_type: "player_action", actors: [actorId, targetId], location_id: liveTarget.current_location_id,
        description: outcome.reason, payload: { topic: outcome.topic, kind: "chance" }, priority: 2 });
      await runAutonomousCognition(live, event, generate);
      if (isStale(live)) return { city: requireSessionCity(), outcome, talked: false };
    }
    return { city: saveAndReturn(live), outcome, talked: true };
  } catch (error) {
    return { city: isStale(live) ? requireSessionCity() : saved, outcome, talked: false, error: error instanceof Error ? error.message : "They could not talk right now." };
  }
}

/** The resident you play goes over to someone, ready to talk. No AI call: you speak first. */
export async function sessionApproach(targetId: string) {
  const city = requireSessionCity();
  const playerId = city.policy.player_citizen_id as string | null | undefined;
  if (!playerId) throw new Error("Play as someone first.");
  const you = findCitizen(city, playerId), target = findCitizen(city, targetId);
  if (you === target) throw new Error("Choose someone else.");
  if (/sleep/i.test(target.current_activity)) throw new Error(`${target.name.split(" ")[0]} is asleep 😴. Try again when they're up.`);
  if (you.current_location_id !== target.current_location_id) {
    you.current_location_id = target.current_location_id;
    you.x = you.target_x = target.x;
    you.y = you.target_y = target.y;
  }
  you.current_activity = `With ${target.name}`;
  city.policy.player_destination = null;
  return saveAndReturn(city);
}

/** Turns a plan agreed in the player's chat into a real meet-up both residents remember. */
export async function sessionAddPlan(a: string, b: string, plan: { day: number; minute: number; location_id: string }, topic: string) {
  const city = requireSessionCity();
  const [first, second] = [findCitizen(city, a), findCitizen(city, b)];
  const due = plan.day * 1440 + plan.minute;
  if (due < cityMinute(city) + 30 || due > cityMinute(city) + 14 * 1440) throw new Error("Plans can be made from half an hour to two weeks ahead.");
  if ((city.meetings ?? []).some((m) => m.status === "scheduled" && m.actor_ids.includes(a) && m.actor_ids.includes(b) && Math.abs(meetingMinute(m) - due) < 60))
    throw new Error("That plan is already saved.");
  const meeting = { actor_ids: [a, b], location_id: plan.location_id, game_day: plan.day, game_minute: plan.minute, topic: topic.slice(0, 240),
    id: newId("plan"), source_conversation_id: "player_chat", status: "scheduled" as const };
  city.meetings = [...(city.meetings ?? []).slice(-39), meeting];
  const at = `${String(Math.floor(plan.minute / 60)).padStart(2, "0")}:${String(plan.minute % 60).padStart(2, "0")}`;
  const description = `${first.name} and ${second.name} agreed to meet at ${locationName(city, plan.location_id)} on ${weekday(plan.day)} (day ${plan.day}) at ${at}: ${topic}.`;
  lifeSink(city)({ kind: "plan", icon: "📅", headline: description, actors: [a, b], priority: 2, location_id: plan.location_id,
    memories: [first, second].map((p) => ({ citizen_id: p.citizen_id, content: description, importance: 0.8, related_citizen_id: p === first ? b : a })) });
  return saveAndReturn(city);
}

function adjustBonds(city: CityState, changes: BondChange[]) {
  if (!changes.length) return;
  const relationships = ensureRelationships(city);
  for (const change of changes) {
    const bond = relationships.find((r) => r.citizen_id === change.from && r.other_citizen_id === change.to);
    if (!bond) continue;
    bond.trust = clamp(bond.trust + (change.trust ?? 0));
    bond.warmth = clamp(bond.warmth + (change.warmth ?? 0));
    bond.familiarity = clamp(bond.familiarity + (change.familiarity ?? 0));
    const feelings = { ...emptyFeelings(), ...bond.feelings };
    for (const [key, value] of Object.entries(change.feelings ?? {})) feelings[key as keyof typeof feelings] = clamp(feelings[key as keyof typeof feelings] + Number(value));
    bond.feelings = feelings;
    bond.last_changed_at = cityMinute(city);
    bond.history = [...(bond.history ?? []), { day: city.clock.day, minute: city.clock.minute_of_day, reason: change.reason, effect: "situation", feelings }].slice(-20);
  }
  writeJson(RELATIONSHIPS_KEY, relationships);
}

/** Updates the sky, announces notable weather and applies earthquakes, heat and storms to residents. */
function refreshWeather(city: CityState, previousMinute: number) {
  city.calendar_start ??= calendarStartFor(city.clock.day);
  const start = city.calendar_start;
  const override = city.weather_override && city.weather_override.day === city.clock.day ? city.weather_override : null;
  if (city.weather_override && !override) city.weather_override = null;
  const before = city.weather;
  const now = weatherAt(start, city.clock.day, city.clock.minute_of_day, override);
  city.weather = now;
  const sink = lifeSink(city);
  const newDay = city.clock.minute_of_day < previousMinute;
  if (newDay || !before) {
    const today = calendarDay(start, city.clock.day);
    const w = dayWeather(start, city.clock.day);
    const notes = [
      today.holiday && `🎌 Today is ${today.holiday}: offices and schools are closed.`,
      today.schoolBreak && !calendarDay(start, city.clock.day - 1).schoolBreak && `🎒 ${today.schoolBreak} starts today!`,
      w.rainySeason && !dayWeather(start, city.clock.day - 1).rainySeason && "☔ Tsuyu, the rainy season, has begun.",
      w.condition === "typhoon" && "🌀 A typhoon is hitting Nakameguro. School is closed and trains are suspended.",
      w.condition === "heavy_rain" && "🌧️ Heavy rain warning in effect today.",
      w.condition === "snow" && "❄️ Snow is falling on Nakameguro!",
      w.heatwave && `🥵 Heatstroke alert: up to ${Math.round(w.high)}°C today.`,
      today.month === 4 && today.dayOfMonth === 1 && "🌸 Cherry blossom season: hanami picnics in the park!",
    ].filter(Boolean) as string[];
    for (const note of notes) sink({ kind: "weather", icon: note.slice(0, note.indexOf(" ")), headline: note.slice(note.indexOf(" ") + 1), actors: [], priority: 2 });
  }
  const entering = (key: "lightning" | "heatwave") => Boolean(now[key]) && !before?.[key];
  if (now.quake && !before?.quake) weatherEffects(city, "earthquake", now.quake.intensity, sink);
  if (entering("heatwave")) weatherEffects(city, "heatwave", 0, sink);
  if (now.condition === "typhoon" && before?.condition !== "typhoon") weatherEffects(city, "typhoon", 0, sink);
  if (now.quake && now.quake.intensity >= 4) city.evacuation_until = cityMinute(city) + 150;
}

/** Player weather controls: the chosen sky lasts six city hours (an earthquake is instant). */
export async function sessionSetWeather(condition: WeatherOverride["condition"] | null, options: { temp_c?: number; source?: WeatherOverride["source"] } = {}) {
  const city = requireSessionCity();
  const minute = city.clock.minute_of_day;
  city.weather_override = condition ? { condition, day: city.clock.day, from: minute, until: Math.min(1440, minute + (condition === "earthquake" ? 15 : 360)), ...options } : null;
  refreshWeather(city, minute);
  return saveAndReturn(city);
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

function isStale(city: CityState) {
  return (getSessionCity()?.revision ?? 0) !== (city.revision ?? 0);
}

function normalizeCity(city: CityState): CityState {
  const normalized = clone(city);
  normalized.events = normalized.events.slice(-80);
  normalized.metrics = calculateMetrics(normalized);
  return normalized;
}

function updateCitizen(
  city: CityState,
  citizen: CitizenAgent,
  previousMinute: number,
) {
  const events: CityEvent[] = [];
  const oldLocation = citizen.current_location_id;
  const task = playerTask(citizen);
  const taskWasActive = task?.status === "active";
  const [targetLocationId, activity] = desiredLocation(city, citizen);
  const activeTarget =
    taskWasActive && task ? currentTaskTarget(city, task) : city.encounter?.actor_id === citizen.citizen_id && activity.startsWith("Approaching ")
      ? city.citizens.find((c) => c.citizen_id === city.encounter?.target_id) : campaignTarget(city, citizen);
  const targetLocation =
    city.locations.find(
      (location) => location.location_id === targetLocationId,
    ) ??
    city.locations.find(
      (location) => location.location_id === citizen.home_location_id,
    ) ??
    city.locations[0];

  citizen.current_activity = activity;
  citizen.target_x =
    activeTarget?.x ?? targetLocation.x + Math.floor(targetLocation.width / 2);
  citizen.target_y =
    activeTarget?.y ?? targetLocation.y + Math.floor(targetLocation.height / 2);
  moveToward(citizen, citizen.target_x, citizen.target_y, city);
  const arrived =
    citizen.x === citizen.target_x && citizen.y === citizen.target_y;
  if (arrived) {
    citizen.current_location_id = targetLocation.location_id;
  }
  updateNeeds(citizen);
  if (arrived) applyLocationEffects(city, citizen, targetLocation.location_id);
  if (arrived) {
    const companionTask = activeCompanionTask(citizen);
    if (
      companionTask &&
      citizen.current_location_id === companionTask.location_id
    ) {
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
    const actors = [
      citizen.citizen_id,
      activeTaskTarget?.citizen_id ?? taskAfterArrival.target_citizen_id,
    ].filter(Boolean) as string[];
    const progress = taskProgressLabel(city, citizen, taskAfterArrival);
    events.push(
      addEvent(city, {
        event_type:
          activeTaskTarget && !nearCitizen(citizen, activeTaskTarget)
            ? "player_task_travel"
            : "player_task_progress",
        location_id:
          activeTaskTarget?.current_location_id ?? targetLocation.location_id,
        actors,
        description: `${citizen.name} is ${progress}: ${taskAfterArrival.task}`,
        payload: { task: taskAfterArrival.task, progress },
        priority: 3,
      }),
    );
  } else if (previousMinute < 480 && city.clock.minute_of_day >= 480 && !isWeekend(city.clock.day) && citizen.profession === "Student") {
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

function campaignTarget(city: CityState, citizen: CitizenAgent) {
  const agenda = liveElection(city)?.agenda;
  return agenda?.candidate_id === citizen.citizen_id
    ? city.citizens.find((c) => c.citizen_id === agenda.target_id) ?? null : null;
}

function desiredLocation(
  city: CityState,
  citizen: CitizenAgent,
): [string, string] {
  const campaigning = campaignTarget(city, citizen);
  if (campaigning && playerTask(citizen)?.status !== "active") return [campaigning.current_location_id, `Campaigning: meeting ${campaigning.name}`];
  const task = playerTask(citizen);
  if (task?.status === "active") {
    if (task.task_kind === "go_to_location") {
      return [
        task.location_id ?? citizen.current_location_id,
        `Going to ${locationName(city, task.location_id ?? citizen.current_location_id)}`,
      ];
    }
    if (task.task_kind === "go_with_citizen" && task.companion_confirmed) {
      const companion = task.target_citizen_id
        ? city.citizens.find(
            (item) => item.citizen_id === task.target_citizen_id,
          )
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
    return [
      task.location_id ?? citizen.current_location_id,
      `Thinking through: ${task.task}`,
    ];
  }
  const companionTask = activeCompanionTask(citizen);
  if (companionTask) {
    const leader = city.citizens.find(
      (item) => item.citizen_id === companionTask.leader_citizen_id,
    );
    return [
      companionTask.location_id,
      `Going to ${locationName(city, companionTask.location_id)}${leader ? ` with ${leader.name}` : ""}`,
    ];
  }
  if (citizen.age < 2) {
    const carer = caregiverFor(city, citizen);
    if (carer) return [carer.current_location_id, /sleep|nap/i.test(carer.current_activity) ? "Sleeping" : `Being looked after by ${carer.name.split(" ")[0]}`];
  }
  const care = careNeeded(citizen, city.clock.day);
  if (care) return [care.place, care.place === "loc_hospital" ? `Seeing the doctor about ${care.condition.name}` : `Buying medicine for ${care.condition.name}`];
  const resting = bedRest(citizen);
  if (resting && city.clock.minute_of_day >= 420 && city.clock.minute_of_day < 1260) return [citizen.home_location_id, `Resting in bed with ${resting.name === "flu" ? "the flu" : `a ${resting.name}`}`];
  const gathering = gatheringFor(city, citizen);
  if (gathering) return [gathering.location_id, gathering.kind === "birthday" && gathering.host_ids.includes(citizen.citizen_id) ? "Celebrating at my birthday party" : `At ${gathering.title}`];
  const recovering = citizen.current_location_id === "loc_hospital"
    && citizen.x === citizen.target_x && citizen.y === citizen.target_y
    && (citizen.health < Math.min(85, healthCap(citizen.age) - 8) || citizen.energy < 45 || citizen.hunger > 60);
  if (citizen.health < 55 || recovering) return ["loc_hospital", recovering ? "Recovering at hospital" : "Seeking medical help"];
  if (citizen.hunger > 74) {
    const market = city.locations.find((l) => l.location_id === "loc_market");
    // With no money or an empty market, people eat what is at home instead of waiting at the stalls.
    return citizen.money >= 4 && Number(market?.inventory.food ?? 0) > 0 ? ["loc_market", "Buying food"] : [citizen.home_location_id, "Eating at home"];
  }
  if (citizen.energy < 22) return [citizen.home_location_id, "Resting at home"];
  const appointment = meetingFor(city, citizen);
  if (appointment) return [appointment.location_id, `Going to meet ${appointment.actor_ids.filter((id) => id !== citizen.citizen_id).map((id) => city.citizens.find((c) => c.citizen_id === id)?.name).join(" and ")}: ${appointment.topic}`];
  if (city.encounter?.actor_id === citizen.citizen_id) return [city.encounter.location_id, `Approaching ${city.citizens.find((c) => c.citizen_id === city.encounter?.target_id)?.name}`];
  const stop = routineStop(citizen, city.clock.day, city.clock.minute_of_day, routineContext(city));
  return [stop.location_id, stop.activity];
}

/** In live mode, `beat` lets conversations happen between the 15-minute ticks of real time. */
async function advanceSocial(city: CityState, cognition: GenerateCognition, decide?: DecideSocial, beat = false) {
  const now = cityMinute(city);
  for (const meeting of city.meetings ?? []) {
    if (meeting.status !== "scheduled") continue;
    if (now > meetingMinute(meeting) + 60) {
      meeting.status = "missed";
      const description = `The meeting about ${meeting.topic} at ${locationName(city, meeting.location_id)} did not happen. Nobody was forced to attend.`;
      addEvent(city, { event_type: "meeting_missed", actors: meeting.actor_ids, location_id: meeting.location_id, description, priority: 2 });
      meeting.actor_ids.forEach((id) => addMemory({ citizen_id: id, related_citizen_id: meeting.actor_ids.find((other) => other !== id) ?? null, kind: "episodic", content: `My planned meeting about ${meeting.topic} did not happen. I do not know why the other person did not attend.`, importance: 0.6, salience: 0.6, extra: { source: "meeting_missed" } }));
    } else if (!city.encounter && now >= meetingMinute(meeting)) {
      const people = meeting.actor_ids.map((id) => city.citizens.find((c) => c.citizen_id === id));
      if (people.every((c) => c && sociallyAvailable(c, city.policy.player_citizen_id) && c.current_location_id === meeting.location_id)) {
        city.encounter = { actor_id: meeting.actor_ids[0], target_id: meeting.actor_ids[1], location_id: meeting.location_id, topic: meeting.topic,
          reason: `They both kept their plan to meet at ${locationName(city, meeting.location_id)} about ${meeting.topic}.`, started_at: now - 15, meeting_id: meeting.id };
      }
    }
  }
  const encounter = city.encounter;
  if (encounter) {
    const actor = findCitizen(city, encounter.actor_id), target = findCitizen(city, encounter.target_id);
    const interrupted = [actor, target].some((c) => c.citizen_id === city.policy.player_citizen_id || playerTask(c)?.status === "active" || c.energy < 18 || c.health < 45 || c.current_location_id !== encounter.location_id);
    if (interrupted || now - encounter.started_at > 60) {
      addEvent(city, { event_type: "encounter_interrupted", actors: [actor.citizen_id, target.citizen_id], description: `${actor.name} could not catch ${target.name} before circumstances changed.`, priority: 1 });
      city.encounter = null;
      return;
    }
    if ((!beat && now <= encounter.started_at) || !sociallyAvailable(actor, city.policy.player_citizen_id) || !sociallyAvailable(target, city.policy.player_citizen_id) || !nearCitizen(actor, target)) return;
    const event = addEvent(city, { event_type: "social_opportunity", actors: [actor.citizen_id, target.citizen_id], location_id: encounter.location_id,
      description: encounter.reason, payload: { topic: encounter.topic, kind: encounter.meeting_id ? "planned" : "chance", meeting_id: encounter.meeting_id }, priority: 2 });
    await runAutonomousCognition(city, event, cognition);
    if (encounter.meeting_id) {
      const meeting = city.meetings?.find((m) => m.id === encounter.meeting_id);
      if (meeting) meeting.status = "completed";
    }
    city.encounter = null;
    return;
  }
  if (!beat && now - Number(city.policy.last_social_choice ?? -10000) < 45) return;
  const recent = sessionConversations();
  const available = city.citizens.filter((c) => sociallyAvailable(c, city.policy.player_citizen_id) && !meetingFor(city, c));
  const choices = available.map((actor) => ({ actor, nearby: available.filter((target) => target !== actor && target.current_location_id === actor.current_location_id
    && !recent.some((c) => c.actor_ids.includes(actor.citizen_id) && c.actor_ids.includes(target.citizen_id) && now - (c.game_day * 1440 + c.game_minute) < 120)) })).filter((choice) => choice.nearby.length);
  const turns = (city.policy.social_choice_times ?? {}) as Record<string, number>;
  choices.sort((a, b) => (turns[a.actor.citizen_id] ?? 0) - (turns[b.actor.citizen_id] ?? 0));
  const choice = choices[0];
  if (!choice) return;
  if (!decide) throw new Error("Social decision service is unavailable.");
  const decision = await decide({ citizen: clone(choice.actor), city_time: describeNow(city),
    location: locationName(city, choice.actor.current_location_id), memories: privateMemoryContext(choice.actor),
    nearby: choice.nearby.map((c) => ({ citizen_id: c.citizen_id, name: c.name, activity: c.current_activity })) });
  if (isStale(city)) throw new Error("This action was interrupted.");
  if (!decision.reason?.trim() || (decision.target_id && (!decision.topic?.trim() || !choice.nearby.some((c) => c.citizen_id === decision.target_id)))) throw new Error("The citizen selected an unavailable encounter.");
  city.policy.last_social_choice = now;
  city.policy.social_choice_times = { ...turns, [choice.actor.citizen_id]: now };
  choice.actor.current_thought = decision.reason;
  if (!decision.target_id) {
    addEvent(city, { event_type: "quiet_moment", actors: [choice.actor.citizen_id], description: `${choice.actor.name} chose some time alone: ${decision.reason}`, priority: 1 });
    return;
  }
  city.encounter = { actor_id: choice.actor.citizen_id, target_id: decision.target_id, location_id: choice.actor.current_location_id,
    reason: decision.reason, topic: decision.topic, started_at: now };
  addEvent(city, { event_type: "encounter_intention", actors: [choice.actor.citizen_id, decision.target_id], location_id: choice.actor.current_location_id,
    description: `${choice.actor.name} wants to approach ${findCitizen(city, decision.target_id).name}: ${decision.reason}`, priority: 2 });
}

function currentTaskTarget(city: CityState, task: PlayerTaskData) {
  if (task.task_kind === "go_with_citizen" && task.companion_confirmed)
    return null;
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
  return nextTargetId
    ? (city.citizens.find((citizen) => citizen.citizen_id === nextTargetId) ??
        null)
    : null;
}

function nearCitizen(first: CitizenAgent, second: CitizenAgent) {
  return (
    first.current_location_id === second.current_location_id &&
    Math.abs(first.x - second.x) + Math.abs(first.y - second.y) <= 2
  );
}

function taskProgressLabel(
  city: CityState,
  citizen: CitizenAgent,
  task: PlayerTaskData,
) {
  if (task.task_kind === "self_answer") return "answering the player";
  if (task.task_kind === "go_to_location")
    return `walking to ${locationName(city, task.location_id ?? citizen.current_location_id)}`;
  if (task.task_kind === "go_with_citizen" && task.companion_confirmed) {
    return `walking to ${locationName(city, task.location_id ?? citizen.current_location_id)} with the companion`;
  }
  const target = currentTaskTarget(city, task);
  if (!target) return "wrapping up the task";
  const completed = task.completed_target_ids?.length ?? 0;
  const total =
    task.target_citizen_ids?.length ?? (task.target_citizen_id ? 1 : 0);
  const count = total > 1 ? ` (${completed + 1}/${total})` : "";
  return nearCitizen(citizen, target)
    ? `talking with ${target.name}${count}`
    : `walking to ${target.name}${count}`;
}

async function runTaskCognition(
  city: CityState,
  citizen: CitizenAgent,
  generateCognition: GenerateCognition,
) {
  const task = playerTask(citizen);
  if (!task) return;
  const target = currentTaskTarget(city, task);
  if (!target && isLocationTask(task)) {
    citizen.current_thought = `I am focused on the current task: ${task.task}`;
    citizen.personality = {
      ...citizen.personality,
      player_task: { ...task, last_cognition_tick: city.clock.tick },
    };
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
    citizen.personality = {
      ...citizen.personality,
      player_task: { ...task, last_cognition_tick: city.clock.tick },
    };
    return;
  }
  if (target.citizen_id === city.policy.player_citizen_id) {
    blockManualTask(
      city,
      citizen,
      task,
      "task_unresolved",
      `${citizen.name} is waiting to speak with you about: ${task.task}. Open Talk to reply as ${target.name}.`,
    );
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
    prior_lines: recentChat(city, citizen.citizen_id, target.citizen_id),
    memories: scopedPrivateMemoryContext(citizen, task.task, target),
    private_memories: {
      [citizen.citizen_id]: scopedPrivateMemoryContext(
        citizen,
        task.task,
        target,
      ),
      [target.citizen_id]: privateMemoryContext(target, citizen.citizen_id),
    },
  });
  applyCognition(city, citizen, target, task, response);
}

function buildSoloTaskObservations(
  city: CityState,
  citizen: CitizenAgent,
  task: PlayerTaskData,
) {
  return [
    `Player task: "${task.task}". ${citizen.name} has chosen to handle this without a conversation target.`,
    task.plan_summary
      ? `Agent plan visible to player: ${task.plan_summary}`
      : "",
    task.reasoning_summary
      ? `Agent private planning summary: ${task.reasoning_summary}`
      : "",
    `${citizen.name} is at ${locationName(city, citizen.current_location_id)}, mood ${citizen.mood}, currently ${citizen.current_activity.toLowerCase()}.`,
    `The answer or next action must come from ${citizen.name}'s own memory, relationships, goals, and current state.`,
  ].filter(Boolean);
}

function buildTaskObservations(
  city: CityState,
  citizen: CitizenAgent,
  target: CitizenAgent,
  task: PlayerTaskData,
) {
  const relationshipScore =
    citizen.relationship_scores[target.citizen_id] ?? 38;
  const completed = task.completed_target_ids?.length ?? 0;
  const total =
    task.target_citizen_ids?.length ?? (task.target_citizen_id ? 1 : 0);
  const routeProgress =
    total > 1
      ? `This is conversation ${completed + 1} of ${total} in a player-directed route.`
      : "";
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
  ].filter(Boolean);
}

function privateFeelingContext(citizen: CitizenAgent, targetId?: string) {
  const names = new Map(getSessionCity()?.citizens.map((c) => [c.citizen_id, c.name]));
  return sessionRelationships(citizen.citizen_id)
    .filter((bond) => (!targetId || bond.other_citizen_id === targetId) && bond.history?.length)
    .map((bond) => `My private feelings toward ${names.get(bond.other_citizen_id) ?? bond.other_citizen_id}: ${JSON.stringify(bond.feelings ?? emptyFeelings())}. Trust: ${bond.trust}. Last experience: ${bond.history?.at(-1)?.reason}. These are my feelings, not evidence of their intentions.`);
}

function privateMemoryContext(citizen: CitizenAgent, targetId?: string) {
  const seen = new Set<string>();
  const memories = sessionMemories(citizen.citizen_id)
    .filter((memory) => {
      const key = memory.content.trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(b.related_citizen_id === targetId && Boolean(targetId)) - Number(a.related_citizen_id === targetId && Boolean(targetId)))
    .slice(0, 6)
    .map((memory) => `${citizen.name} past private experience (${memory.created_at}; not a current request): ${memory.content}`);
  return [...electionNotice(getSessionCity()!), ...privateFeelingContext(citizen, targetId), ...memories];
}

function scopedPrivateMemoryContext(
  citizen: CitizenAgent,
  currentTask: string,
  target?: CitizenAgent | null,
) {
  const rawMemories = sessionMemories(citizen.citizen_id);
  const seed = rawMemories
    .filter((memory) => memory.extra?.source === "seed")
    .slice(0, 1)
    .map(
      (memory) => `${citizen.name} private identity memory: ${memory.content}`,
    );
  const relevant = rawMemories
    .filter((memory) => memory.extra?.source !== "seed")
    .filter((memory) =>
      memoryRelevantToCurrentTask(memory.content, currentTask, target),
    )
    .slice(0, 5)
    .map(
      (memory) =>
        `${citizen.name} private memory relevant to current task: ${memory.content}`,
    );
  return [
    `${citizen.name} current active task, highest priority: ${currentTask}`,
    "Prior memories are background only. Do not continue a prior task or repeat a prior topic unless the current active task explicitly asks for it.",
    ...seed,
    ...electionNotice(getSessionCity()!),
    ...privateFeelingContext(citizen, target?.citizen_id),
    ...relevant,
  ];
}

function locationName(city: CityState, locationId: string) {
  return (
    city.locations.find((location) => location.location_id === locationId)
      ?.name ?? locationId
  );
}

async function runAutonomousCognition(
  city: CityState,
  event: CityEvent,
  generateCognition: GenerateCognition,
) {
  const [actorId, targetId] = event.actors;
  if (!actorId || !targetId) return;
  const actor = city.citizens.find((citizen) => citizen.citizen_id === actorId);
  const target = city.citizens.find(
    (citizen) => citizen.citizen_id === targetId,
  );
  if (!actor || !target) return;

  const relationshipScore = actor.relationship_scores[target.citizen_id] ?? 38;
  const response = await generateCognition({
    city,
    actor_id: actor.citizen_id,
    conversation_mode: "autonomous",
    target_id: target.citizen_id,
    required_target_id: target.citizen_id,
    require_conversation: true,
    task: `Talk with ${target.name} about ${String(event.payload?.topic || "what brought you together").slice(0, 180)}.`,
    prior_lines: recentChat(city, actor.citizen_id, target.citizen_id),
    observations: [
      `Autonomous social moment: ${event.description}`,
      `${actor.name} and ${target.name} are ${relationshipLabelFromScore(relationshipScore)} at ${locationName(city, actor.current_location_id)}.`,
      `${actor.name} is ${actor.mood.toLowerCase()} and ${target.name} is ${target.mood.toLowerCase()}.`,
      "Let them talk like real people of their ages. The conversation should reveal whether they are strangers, acquaintances, friends, family, or at odds.",
      "Respect a wish for privacy or a refusal. A conversation may end without becoming friends. Only make a future plan if both genuinely want it.",
    ],
    memories: [],
    private_memories: {
      [actor.citizen_id]: privateMemoryContext(actor, target.citizen_id),
      [target.citizen_id]: privateMemoryContext(target, actor.citizen_id),
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
  if (!validTaskConversation(response.conversation, actor, target))
    throw new Error(
      "No valid conversation was returned; nothing was committed.",
    );
  actor.current_thought = response.thought;
  const actorMemory =
    response.participant_memories?.[actor.citizen_id] ?? response.memory;
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
      reflection:
        response.participant_reflections?.[actor.citizen_id] ??
        response.reflection,
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

  const conversation = validTaskConversation(
    response.conversation,
    actor,
    target,
  );
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

  const before = relationshipLabelFromScore(
    actor.relationship_scores[target.citizen_id] ?? 38,
  );
  const savedConversation: Conversation = {
    ...conversation,
    conversation_id: conversation.conversation_id || newId("convo"),
    game_day: city.clock.day,
    game_minute: city.clock.minute_of_day,
    location_id: conversation.location_id ?? actor.current_location_id,
    actor_ids: [actor.citizen_id, target.citizen_id],
    transcript: conversation.transcript.slice(0, 8),
    encounter: ["social_opportunity", "player_action"].includes(sourceEvent.event_type) ? {
      kind: sourceEvent.payload?.kind === "planned" ? "planned" : "chance",
      reason: sourceEvent.description, topic: String(sourceEvent.payload?.topic ?? ""),
      meeting_id: typeof sourceEvent.payload?.meeting_id === "string" ? sourceEvent.payload.meeting_id : undefined,
    } as EncounterContext : undefined,
  };
  recordMeeting(city, response, savedConversation);
  savedConversation.impacts = strengthenRelationship(city, actor, target, response, savedConversation.conversation_id);
  const after = relationshipLabelFromScore(
    actor.relationship_scores[target.citizen_id] ?? 38,
  );
  savedConversation.summary = `${savedConversation.summary} Relationship: ${before} -> ${after}.`;
  beatForConversation(city, savedConversation, firstNames(city));
  writeJson(
    CONVERSATIONS_KEY,
    [savedConversation, ...sessionConversations()].slice(0, 80),
  );
  addEvent(city, {
    event_type: "conversation",
    location_id: savedConversation.location_id,
    actors: savedConversation.actor_ids,
    description: `${actor.name} and ${target.name} talked autonomously: ${savedConversation.summary}`,
    payload: {
      conversation_id: savedConversation.conversation_id,
      source_event_id: sourceEvent.event_id,
    },
    priority: 2,
  });
}

function applySoloCognition(
  city: CityState,
  citizen: CitizenAgent,
  task: PlayerTaskData,
  response: SessionCognitionResponse,
) {
  const answer = response.thought || response.memory || response.reflection;
  const citizenMemory =
    response.participant_memories?.[citizen.citizen_id] ?? response.memory;
  citizen.current_activity = "Answered the player";
  citizen.current_thought = answer;
  citizen.mood = response.mood || citizen.mood;
  citizen.memory_summary = compactSummary(
    citizen.memory_summary,
    citizenMemory,
  );
  citizen.personality = {
    ...citizen.personality,
    player_task: { ...task, last_cognition_tick: city.clock.tick },
  };

  addMemory({
    citizen_id: citizen.citizen_id,
    kind: "episodic",
    content:
      citizenMemory || `${citizen.name} handled the player task: ${task.task}`,
    importance: response.importance || 0.64,
    salience: response.importance || 0.64,
    related_citizen_id: null,
    extra: {
      source: "session_cognition",
      reflection:
        response.participant_reflections?.[citizen.citizen_id] ??
        response.reflection,
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
        location_id:
          responseConversation.location_id ?? citizen.current_location_id,
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
  writeJson(
    CONVERSATIONS_KEY,
    [conversation, ...sessionConversations()].slice(0, 80),
  );
  addEvent(city, {
    event_type: "task_answer",
    location_id: citizen.current_location_id,
    actors: [citizen.citizen_id],
    description: `${citizen.name} answered through AI cognition: ${answer}`,
    payload: { task: task.task, conversation_id: conversation.conversation_id },
    priority: 3,
  });
  if (task.task_kind === "self_answer") {
    finishManualTask(city, citizen, task, citizen.current_location_id);
  } else {
    blockManualTask(city, citizen, task, "task_unresolved", `${citizen.name} has a response, but no executed action fulfills this request yet: ${answer}`);
  }
}

function recordMeeting(city: CityState, response: SessionCognitionResponse, conversation: Conversation) {
  const meeting = acceptMeeting(city, response.meeting_plan, conversation.actor_ids, conversation.conversation_id);
  if (!meeting) return;
  city.meetings = [...(city.meetings ?? []).filter((m) => m.id !== meeting.id).slice(-39), meeting];
  const at = `${String(Math.floor(meeting.game_minute / 60)).padStart(2, "0")}:${String(meeting.game_minute % 60).padStart(2, "0")}`;
  const description = `${meeting.actor_ids.map((id) => findCitizen(city, id).name).join(" and ")} agreed to meet at ${locationName(city, meeting.location_id)} on day ${meeting.game_day} at ${at}: ${meeting.topic}.`;
  addEvent(city, { event_type: "meeting_planned", location_id: meeting.location_id, actors: meeting.actor_ids, description,
    payload: { conversation_id: conversation.conversation_id, meeting_id: meeting.id }, priority: 2 });
  meeting.actor_ids.forEach((id) => addMemory({ citizen_id: id, related_citizen_id: meeting.actor_ids.find((other) => other !== id) ?? null, kind: "episodic", content: description,
    importance: 0.8, salience: 0.85, extra: { source: "agreed_meeting", meeting_id: meeting.id } }));
}

function applyCognition(
  city: CityState,
  citizen: CitizenAgent,
  target: CitizenAgent,
  task: PlayerTaskData,
  response: SessionCognitionResponse,
) {
  if (!validTaskConversation(response.conversation, citizen, target))
    throw new Error(
      "No valid conversation was returned; nothing was committed.",
    );
  citizen.current_thought = response.thought;
  const actorMemory =
    response.participant_memories?.[citizen.citizen_id] ?? response.memory;
  const targetMemory =
    response.participant_memories?.[target.citizen_id] ??
    `${target.name} remembers that ${citizen.name} spoke with them about: ${task.task}.`;
  citizen.memory_summary = compactSummary(citizen.memory_summary, actorMemory);
  target.memory_summary = compactSummary(target.memory_summary, targetMemory);
  const previousCompleted = task.completed_target_ids ?? [];
  const completedTargetIds = Array.from(
    new Set([...previousCompleted, target.citizen_id]),
  );
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
      reflection:
        response.participant_reflections?.[citizen.citizen_id] ??
        response.reflection,
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

  const conversation = validTaskConversation(
    response.conversation,
    citizen,
    target,
  );
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
        .map((line) => ({
          speaker_id: line.speaker_id,
          text: line.text.trim(),
        }))
        .slice(0, 8),
    };
    const before = relationshipLabelFromScore(
      citizen.relationship_scores[target.citizen_id] ?? 38,
    );
    recordMeeting(city, response, savedConversation);
    savedConversation.impacts = strengthenRelationship(city, citizen, target, response, savedConversation.conversation_id);
    const after = relationshipLabelFromScore(
      citizen.relationship_scores[target.citizen_id] ?? 38,
    );
    savedConversation.summary = `${savedConversation.summary} Relationship: ${before} -> ${after}.`;
    beatForConversation(city, savedConversation, firstNames(city));
    writeJson(
      CONVERSATIONS_KEY,
      [savedConversation, ...sessionConversations()].slice(0, 80),
    );
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
    if (
      response.participant_outcomes?.[target.citizen_id]
        ?.invitation_response !== "accepted"
    ) {
      blockManualTask(
        city,
        citizen,
        updatedTask,
        "invitation_unresolved",
        `${target.name} has not agreed to go. The invitation is unresolved; no journey was started.`,
      );
      return;
    }
    const destinationId = task.location_id ?? citizen.current_location_id;
    const coordinatedTask = {
      ...updatedTask,
      companion_confirmed: true,
      target_citizen_id: target.citizen_id,
      target_citizen_ids: [target.citizen_id],
      completed_target_ids: [target.citizen_id],
      last_cognition_tick: city.clock.tick,
    };
    citizen.personality = {
      ...citizen.personality,
      player_task: coordinatedTask,
    };
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

  const targetCount =
    task.target_citizen_ids?.length ?? (task.target_citizen_id ? 1 : 0);
  if (
    response.participant_outcomes?.[citizen.citizen_id]?.task_complete !== true
  ) {
    blockManualTask(
      city,
      citizen,
      { ...updatedTask, completed_target_ids: previousCompleted },
      "task_unresolved",
      `${citizen.name} spoke with ${target.name}, but this part of the request is unresolved.`,
    );
    return;
  }
  if (targetCount > 0 && completedTargetIds.length >= targetCount) {
    if (
      response.participant_outcomes?.[citizen.citizen_id]?.task_complete ===
      true
    ) {
      finishManualTask(city, citizen, updatedTask, citizen.current_location_id);
    } else {
      blockManualTask(
        city,
        citizen,
        updatedTask,
        "task_unresolved",
        `${citizen.name} spoke with ${target.name}, but the request is not resolved. Read their conversation before deciding what to do next.`,
      );
    }
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
    .filter(
      (line) =>
        [citizen.citizen_id, target.citizen_id].includes(line.speaker_id) &&
        line.text.trim(),
    )
    .map((line) => ({ speaker_id: line.speaker_id, text: line.text.trim() }));
  const hasActorLine = lines.some(
    (line) => line.speaker_id === citizen.citizen_id,
  );
  const hasTargetLine = lines.some(
    (line) => line.speaker_id === target.citizen_id,
  );
  if (!hasActorLine || !hasTargetLine || lines.length < 2) return null;
  return { ...conversation, transcript: lines };
}

function completeTask(
  city: CityState,
  citizen: CitizenAgent,
  task: PlayerTaskData,
  locationId: string,
) {
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
  eventType:
    | "agent_planning_blocked"
    | "agent_cognition_blocked"
    | "invitation_unresolved"
    | "task_unresolved",
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
  citizen.current_thought =
    "I need my AI cognition before I can handle that task like a real person.";
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

function finishManualTask(
  city: CityState,
  citizen: CitizenAgent,
  task: PlayerTaskData,
  locationId: string,
) {
  completeTask(city, citizen, task, locationId);
  addEvent(city, {
    event_type: "player_task_completed",
    location_id: locationId,
    actors: [
      citizen.citizen_id,
      ...(task.completed_target_ids ?? []),
      task.target_citizen_id,
    ].filter(Boolean) as string[],
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
  return (
    (task.target_citizen_ids ?? []).find(
      (targetId) => !completed.has(targetId),
    ) ?? null
  );
}

function strengthenRelationship(
  city: CityState,
  first: CitizenAgent,
  second: CitizenAgent,
  response: SessionCognitionResponse,
  conversationId: string,
) {
  const impacts: ConversationImpact[] = [];
  const election = liveElection(city);
  if (election?.phase === "campaign") {
    for (const [speaker, listener] of [[first, second], [second, first]]) {
      if (election.candidates.some((c) => c.citizen_id === speaker.citizen_id))
        election.campaign_log.push({ candidate_id: speaker.citizen_id, target_id: listener.citizen_id, conversation_id: conversationId });
    }
    if (election.agenda && [first.citizen_id, second.citizen_id].includes(election.agenda.candidate_id) && [first.citizen_id, second.citizen_id].includes(election.agenda.target_id)) election.agenda = undefined;
    if (election.waiting_for_player && [first.citizen_id, second.citizen_id].includes(election.waiting_for_player.candidate_id) && [first.citizen_id, second.citizen_id].includes(election.waiting_for_player.target_id)) election.waiting_for_player = undefined;
  }
  const relationships = ensureRelationships(city).map((relationship) => {
    const owner =
      relationship.citizen_id === first.citizen_id &&
      relationship.other_citizen_id === second.citizen_id
        ? first
        : relationship.citizen_id === second.citizen_id &&
            relationship.other_citizen_id === first.citizen_id
          ? second
          : null;
    if (!owner) return relationship;
    const outcome = response.participant_outcomes?.[owner.citizen_id];
    const moodBefore = owner.mood;
    if (outcome?.mood) owner.mood = outcome.mood;
    if (outcome?.thought) owner.current_thought = outcome.thought;
    const updated = outcome ? evolveRelationship(
      relationship,
      outcome,
      city.clock.day,
      city.clock.minute_of_day,
      conversationId,
    ) : relationship;
    impacts.push(conversationImpact(relationship, updated, outcome, moodBefore, owner.mood, city.clock.day, city.clock.minute_of_day));
    const otherId = updated.other_citizen_id;
    owner.relationship_scores[otherId] = (updated.trust + updated.warmth) / 2;
    owner.friend_ids = owner.friend_ids.filter((id) => id !== otherId);
    if (["Friends", "Close friends"].includes(bondLabel(updated)))
      owner.friend_ids.push(otherId);
    return updated;
  });
  writeJson(RELATIONSHIPS_KEY, relationships);
  return impacts;
}

function isLocationTask(task: PlayerTaskData) {
  return (
    task.task_kind === "go_to_location" || task.task_kind === "go_with_citizen"
  );
}

function locationTaskReadyToFinish(
  citizen: CitizenAgent,
  task: PlayerTaskData,
) {
  if (task.status !== "active" || !isLocationTask(task) || !task.location_id)
    return false;
  if (citizen.current_location_id !== task.location_id) return false;
  return (
    task.task_kind === "go_to_location" || Boolean(task.companion_confirmed)
  );
}

function finishLocationTask(
  city: CityState,
  citizen: CitizenAgent,
  task: PlayerTaskData,
  locationId: string,
) {
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
  const leaderId =
    typeof data.leader_citizen_id === "string" ? data.leader_citizen_id : "";
  const task = typeof data.task === "string" ? data.task : "";
  const locationId =
    typeof data.location_id === "string" ? data.location_id : "";
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
    target_citizen_id:
      typeof data.target_citizen_id === "string"
        ? data.target_citizen_id
        : null,
    target_citizen_ids: Array.isArray(data.target_citizen_ids)
      ? data.target_citizen_ids.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    completed_target_ids: Array.isArray(data.completed_target_ids)
      ? data.completed_target_ids.filter(
          (id): id is string => typeof id === "string",
        )
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
    plan_summary:
      typeof data.plan_summary === "string" ? data.plan_summary : undefined,
    reasoning_summary:
      typeof data.reasoning_summary === "string"
        ? data.reasoning_summary
        : undefined,
    assigned_day: numberOrUndefined(data.assigned_day),
    assigned_minute: numberOrUndefined(data.assigned_minute),
    status: typeof data.status === "string" ? data.status : "active",
    last_cognition_tick: numberOrUndefined(data.last_cognition_tick),
  };
}

function activeTaskCitizens(city: CityState) {
  return city.citizens.filter(
    (citizen) =>
      playerTask(citizen)?.status === "active" ||
      Boolean(activeCompanionTask(citizen)),
  );
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

function addMemory(
  input: Omit<Memory, "memory_id" | "created_at" | "source_event_id"> & {
    source_event_id?: string | null;
  },
) {
  if (!sessionMemoryEnabled()) return;
  const memories = readJson<Memory[]>(citizenMemoryKey(input.citizen_id)) ?? [];
  const memory: Memory = {
    memory_id: newId("mem"),
    source_event_id: input.source_event_id ?? null,
    created_at: new Date().toISOString(),
    ...input,
  };
  const recent = [memory, ...memories].slice(0, 80);
  const important = memories
    .filter(
      (item) => !recent.some((entry) => entry.memory_id === item.memory_id),
    )
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 40);
  writeJson(citizenMemoryKey(input.citizen_id), [...recent, ...important]);
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
        const kin = relatives(city, citizen).includes(other.citizen_id);
        const housemate = Boolean(citizen.life && citizen.life.household_id === other.life?.household_id);
        const score = Math.max(citizen.relationship_scores[other.citizen_id] ?? 38, kin ? 84 : housemate ? 72 : 0);
        return {
          relationship_id: `rel_${citizen.citizen_id}_${other.citizen_id}`,
          citizen_id: citizen.citizen_id,
          other_citizen_id: other.citizen_id,
          trust: clamp(score),
          warmth: clamp(score),
          familiarity: clamp(kin || housemate ? 92 : Math.max(12, score - 18)),
          feelings: emptyFeelings(),
          notes: `No shared experiences recorded between ${citizen.name} and ${other.name} yet.`,
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
  if (relationships && city) {
    const ids = new Set(relationships.map((r) => r.relationship_id));
    const added = buildInitialRelationships(city).filter((r) => !ids.has(r.relationship_id));
    if (added.length) writeJson(RELATIONSHIPS_KEY, [...relationships, ...added]);
    return [...relationships, ...added];
  }
  if (relationships) return relationships;
  const seeded = city ? buildInitialRelationships(city) : [];
  writeJson(RELATIONSHIPS_KEY, seeded);
  return seeded;
}

function calculateMetrics(city: CityState): CityMetrics {
  const population = Math.max(1, city.citizens.length);
  const average = (selector: (citizen: CitizenAgent) => number) =>
    city.citizens.reduce((sum, citizen) => sum + selector(citizen), 0) /
    population;
  const recentEvents = city.events.slice(-20);
  return {
    population: city.citizens.length,
    average_happiness: round1(average((citizen) => citizen.happiness)),
    city_health: round1(average((citizen) => citizen.health)),
    economy_status: round1(
      Math.min(100, average((citizen) => citizen.money) / 2.2),
    ),
    education_status: round1(average((citizen) => citizen.happiness)),
    traffic_status: round1(
      Math.max(
        0,
        90 -
          recentEvents.filter(
            (event) => event.event_type === "traffic_accident",
          ).length *
            4,
      ),
    ),
    sick_count: city.citizens.filter((citizen) => citizen.health < 65).length,
    active_events: recentEvents.filter((event) => event.priority >= 2).length,
  };
}

function moveToward(citizen: CitizenAgent, targetX: number, targetY: number, city?: CityState) {
  // About 12 map cells per 15 minutes on foot; seniors and snowy pavements are slower.
  // Longer trips across the river use the bus or train unless a typhoon has stopped them.
  const distance = Math.abs(targetX - citizen.x) + Math.abs(targetY - citizen.y);
  const weather = city?.weather?.condition;
  const transit = distance > 28 && weather !== "typhoon";
  let budget = transit ? 32 : citizen.age >= 70 || weather === "snow" ? 8 : 12;
  const dx = targetX - citizen.x;
  const stepX = Math.max(-budget, Math.min(budget, dx));
  citizen.x += stepX;
  budget -= Math.abs(stepX);
  const dy = targetY - citizen.y;
  citizen.y += Math.max(-budget, Math.min(budget, dy));
}

function updateNeeds(citizen: CitizenAgent) {
  citizen.hunger = clamp(citizen.hunger + 3.1);
  citizen.energy = clamp(citizen.energy - 2.3);
  citizen.stress = clamp(citizen.stress + (citizen.energy < 30 ? 0.8 : 0.2));
  citizen.happiness = clamp(
    citizen.happiness - (citizen.hunger > 70 ? 0.8 : 0.1),
  );
  if (citizen.hunger > 88 || citizen.energy < 12) {
    citizen.health = clamp(citizen.health - 1.5);
  }
}

function applyLocationEffects(city: CityState, citizen: CitizenAgent, locationId: string) {
  if (["loc_market", "loc_restaurant"].includes(locationId) && citizen.hunger > 40 && citizen.money >= 4) {
    const location = city.locations.find((p) => p.location_id === locationId);
    if (location && Number(location.inventory.food) > 0) {
      location.inventory.food = Number(location.inventory.food) - 1;
      citizen.money -= 4;
      citizen.hunger = clamp(citizen.hunger - 55);
      recordMeal(citizen, city.clock.tick);
    }
  }
  if (locationId === "loc_hospital") {
    citizen.health = clamp(citizen.health + 12);
    citizen.energy = clamp(citizen.energy + 6);
    citizen.hunger = clamp(citizen.hunger - 8);
  }
  // Family meals at home and school lunch are free; without them students skip class to buy food.
  const mealTime = /breakfast|dinner|lunch/i.test(citizen.current_activity);
  const lunchHour = city.clock.minute_of_day >= 720 && city.clock.minute_of_day < 780;
  // Students get school lunch; workers take a packed lunch break at their workplace.
  const schoolLunch = lunchHour && (locationId === "loc_school" || locationId === citizen.life?.job?.location_id);
  const workSnack = locationId === citizen.life?.job?.location_id && citizen.hunger > 60;
  const fridge = locationId === citizen.home_location_id && citizen.hunger > 70;
  if (((locationId === citizen.home_location_id && mealTime) || schoolLunch || workSnack || fridge) && citizen.hunger > 30) {
    citizen.hunger = clamp(citizen.hunger - 30);
    recordMeal(citizen, city.clock.tick);
    citizen.happiness = clamp(citizen.happiness + 1);
  }
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
  const score =
    (relationship.trust + relationship.warmth + relationship.familiarity) / 3;
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
  const isMovement =
    /\b(go|walk|head|travel|visit|come|take|bring|meet|move)\b/.test(lower);
  if (hasLocation && isMovement)
    return hasTarget ? "go_with_citizen" : "go_to_location";
  return planned ?? "open_task";
}

function inferMentionedCitizenIds(
  task: string,
  city: CityState,
  actorId: string,
) {
  const lower = normalizeText(task);
  return city.citizens
    .filter((citizen) => citizen.citizen_id !== actorId)
    .filter((citizen) => {
      const names = citizen.name.toLowerCase().split(/\s+/).filter(Boolean);
      return names.some((name) => lower.includes(name));
    })
    .map((citizen) => citizen.citizen_id);
}

function inferUnavailableMentionedPersonNames(task: string, city: CityState) {
  const availableNames = new Set(
    city.citizens.flatMap((citizen) => {
      const parts = citizen.name.toLowerCase().split(/\s+/).filter(Boolean);
      return [citizen.name.toLowerCase(), ...parts];
    }),
  );
  const locationWords = new Set(
    city.locations.flatMap((location) => [
      location.name.toLowerCase(),
      location.type.toLowerCase().replaceAll("_", " "),
      ...location.name.toLowerCase().split(/\s+/),
    ]),
  );
  const matches = Array.from(
    task.matchAll(
      /\b(?:[Aa]sk|[Tt]ell|[Ii]nvite|[Mm]eet|[Vv]isit|[Cc]all|[Mm]essage|[Rr]each out to|[Tt]alk to|[Ss]peak to|[Cc]heck on|[Ff]ind)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    ),
  );
  return Array.from(
    new Set(
      matches
        .map((match) => match[1].trim())
        .filter((name) => {
          const lower = name.toLowerCase();
          const first = lower.split(/\s+/)[0];
          return (
            !availableNames.has(lower) &&
            !availableNames.has(first) &&
            !locationWords.has(lower) &&
            !locationWords.has(first)
          );
        }),
    ),
  );
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
      const index = Math.max(
        ...names
          .map((name) => lower.lastIndexOf(name))
          .filter((value) => value >= 0),
      );
      return { location, index: Number.isFinite(index) ? index : -1 };
    })
    .filter((item) => item.index >= 0)
    .sort((a, b) => b.index - a.index);
  return matches[0]?.location.location_id ?? null;
}

function memoryRelevantToCurrentTask(
  content: string,
  task: string,
  target?: CitizenAgent | null,
) {
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
  const targetNames = new Set(
    (target?.name.toLowerCase().split(/\s+/) ?? []).filter(Boolean),
  );
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
