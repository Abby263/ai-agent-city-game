import type {
  AssignTaskPayload,
  CityState,
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
import { createInitialCity } from "@/lib/initial-city";
import type { ElectionDecision, ElectionDecisionRequest } from "./elections";
import type { SocialDecision, SocialDecisionRequest } from "./encounters";
import {
  getSessionCity,
  seedSession,
  sessionApplyPolicy,
  sessionAssignTask,
  sessionStartStory,
  sessionCloseTask,
  sessionConversations,
  sessionMemoryEnabled,
  sessionMemories,
  sessionPause,
  sessionRelationships,
  sessionSetMode,
  sessionStart,
  sessionTick,
  sessionTriggerEvent,
  sessionTakeControl,
  sessionWalkTo,
  sessionSpeak,
  sessionSetWeather,
  sessionSetTimeMode,
  sessionSyncToRealTime,
  sessionSocialBeat,
  sessionAddPlan,
  sessionStartElectionAuto,
  sessionAdvanceAutoElection,
  sessionAct,
  sessionApproach,
  sessionSetCharacterPrompt,
  sessionCallCandidate,
  sessionCastVote,
  sessionOpenBallots,
} from "@/lib/session-simulation";

import { API_URL } from "./api-url";
import { withPrompt } from "./character-prompt";
import type { ActInterpretation, ActRequest } from "./acts";
export { API_URL };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(90000),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(
      typeof error?.detail === "string"
        ? error.detail
        : "The AI could not finish this action. Your task has not been completed.",
    );
  }
  return response.json() as Promise<T>;
}

export const api = {
  // Play-god tools run in the browser world only.
  setWeather: (condition: Parameters<typeof sessionSetWeather>[0], options?: Parameters<typeof sessionSetWeather>[1]) => sessionSetWeather(condition, options),
  startElection: (firstId: string, secondId: string) => sessionStartElectionAuto(firstId, secondId, generateElectionDecision),
  advanceElection: () => sessionAdvanceAutoElection(generateSessionCognition, generateElectionDecision),
  openBallots: () => sessionOpenBallots(),
  castBallot: (voteFor: string | null) => sessionCastVote(voteFor),
  callCandidate: (candidateId: string) => sessionCallCandidate(candidateId),
  setTimeMode: (mode: "live" | "fast") => sessionSetTimeMode(mode),
  addPlan: (a: string, b: string, plan: { day: number; minute: number; location_id: string }, topic: string) => sessionAddPlan(a, b, plan, topic),
  approach: (targetId: string) => sessionApproach(targetId),
  /** Anyone does anything, in the player's words; with no actor it is a situation that just happens. */
  act: (actorId: string | null, targetId: string | null, text: string, thread: import("./session-simulation").ActionThread = {}) =>
    sessionAct(actorId, targetId, text, interpretAct, generateSessionCognition, thread),
  setCharacterPrompt: (citizenId: string, prompt: string | null) => sessionSetCharacterPrompt(citizenId, prompt),
  syncToRealTime: () => sessionSyncToRealTime(),
  socialBeat: (onCognitionStart?: (request: SessionCognitionRequest) => void) => sessionSocialBeat((request) => {
    onCognitionStart?.(request);
    return generateSessionCognition(request);
  }, generateSocialDecision),
  takeControl: sessionTakeControl,
  walkTo: sessionWalkTo,
  speak: (targetId: string, text: string) =>
    sessionSpeak(targetId, text, generateSessionCognition),
  /** First load of a world: it starts playing as a show (once per world). */
  startStory: async (city: CityState) => (sessionMemoryEnabled() && getSessionCity() ? sessionStartStory() : city),
  getState: async () => {
    if (sessionMemoryEnabled()) return seedSession(createInitialCity());
    const city = await request<CityState>("/city/state");
    return seedSession(city);
  },
  getCityConversations: async () => {
    if (sessionMemoryEnabled()) return sessionConversations();
    return request<Conversation[]>("/city/conversations");
  },
  start: async () => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionStart();
    return request<CityState>("/simulation/start", { method: "POST" });
  },
  pause: async (reason?: "hidden") => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionPause(reason);
    return request<CityState>("/simulation/pause", { method: "POST" });
  },
  setMode: async (mode: SimulationMode) => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionSetMode(mode);
    return request<CityState>("/simulation/mode", {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
  },
  tick: async (onCognitionStart?: (request: SessionCognitionRequest) => void) => {
    if (sessionMemoryEnabled() && getSessionCity()) {
      return sessionTick((request) => {
        onCognitionStart?.(request);
        return generateSessionCognition(request);
      }, generateElectionDecision, generateSocialDecision);
    }
    return request<CityState>("/simulation/tick", { method: "POST" });
  },
  triggerEvent: async (payload: TriggerEventPayload) => {
    if (sessionMemoryEnabled() && getSessionCity())
      return sessionTriggerEvent(payload);
    return request<CityState>("/events/trigger", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  applyPolicy: async (payload: MayorPolicyPayload) => {
    if (sessionMemoryEnabled() && getSessionCity())
      return sessionApplyPolicy(payload);
    return request<CityState>("/mayor/policy", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getMemories: async (citizenId: string) => {
    if (sessionMemoryEnabled() && getSessionCity())
      return sessionMemories(citizenId);
    return request<Memory[]>(`/citizens/${citizenId}/memories`);
  },
  getRelationships: async (citizenId: string) => {
    if (sessionMemoryEnabled() && getSessionCity())
      return sessionRelationships(citizenId);
    return request<Relationship[]>(`/citizens/${citizenId}/relationships`);
  },
  getConversations: async (citizenId: string) => {
    if (sessionMemoryEnabled() && getSessionCity())
      return sessionConversations(citizenId);
    return request<Conversation[]>(`/citizens/${citizenId}/conversations`);
  },
  assignTask: async (citizenId: string, payload: AssignTaskPayload) => {
    if (sessionMemoryEnabled() && getSessionCity())
      return sessionAssignTask(citizenId, payload, generateSessionTaskPlan);
    return request<CityState>(`/citizens/${citizenId}/task`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  closeTask: async (citizenId: string) => {
    if (sessionMemoryEnabled() && getSessionCity())
      return sessionCloseTask(citizenId);
    return request<CityState>(`/citizens/${citizenId}/task/close`, {
      method: "POST",
    });
  },
};

// Every resident travels with the character prompt the player can see and edit, so edits take effect on the next call.
const prompted = <T extends { citizens: CityState["citizens"] }>(city: T): T => ({ ...city, citizens: city.citizens.map(withPrompt) });

async function generateSocialDecision(body: SocialDecisionRequest): Promise<SocialDecision> {
  return request<SocialDecision>("/cognition/social", { method: "POST", body: JSON.stringify({ ...body, citizen: withPrompt(body.citizen) }) });
}

async function generateElectionDecision(body: ElectionDecisionRequest): Promise<ElectionDecision> {
  return request<ElectionDecision>("/cognition/election", { method: "POST", body: JSON.stringify({ ...body, citizen: withPrompt(body.citizen) }) });
}

async function generateSessionCognition(
  requestBody: SessionCognitionRequest,
): Promise<SessionCognitionResponse> {
  return request<SessionCognitionResponse>("/cognition/session", {
    method: "POST",
    body: JSON.stringify({ ...requestBody, city: prompted(requestBody.city) }),
  });
}

async function generateSessionTaskPlan(
  requestBody: SessionTaskPlanRequest,
): Promise<SessionTaskPlanResponse> {
  return request<SessionTaskPlanResponse>("/cognition/task-plan", {
    method: "POST",
    body: JSON.stringify({ ...requestBody, city: prompted(requestBody.city) }),
  });
}

/** The game master reads a free-text action or situation and returns bounded effects. */
export async function interpretAct(body: ActRequest): Promise<ActInterpretation> {
  return request<ActInterpretation>("/cognition/act", { method: "POST",
    body: JSON.stringify({ ...body, actor: body.actor && withPrompt(body.actor), target: body.target && withPrompt(body.target) }) });
}

/** The fixed rules every resident follows, shown next to their editable prompt. */
export async function cognitionRules(): Promise<{ game_rules: string; safety_rules: string }> {
  return request("/cognition/rules");
}
