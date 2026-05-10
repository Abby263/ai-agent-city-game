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
import {
  getSessionCity,
  seedSession,
  sessionApplyPolicy,
  sessionAssignTask,
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
} from "@/lib/session-simulation";

const defaultApiUrl =
  typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "/api"
    : "http://localhost:8000";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || defaultApiUrl;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  getState: async () => {
    const sessionCity = getSessionCity();
    if (sessionMemoryEnabled() && sessionCity) return sessionCity;
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
  pause: async () => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionPause();
    return request<CityState>("/simulation/pause", { method: "POST" });
  },
  setMode: async (mode: SimulationMode) => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionSetMode(mode);
    return request<CityState>("/simulation/mode", {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
  },
  tick: async () => {
    if (sessionMemoryEnabled() && getSessionCity()) {
      return sessionTick(generateSessionCognition);
    }
    return request<CityState>("/simulation/tick", { method: "POST" });
  },
  triggerEvent: async (payload: TriggerEventPayload) => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionTriggerEvent(payload);
    return request<CityState>("/events/trigger", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  applyPolicy: async (payload: MayorPolicyPayload) => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionApplyPolicy(payload);
    return request<CityState>("/mayor/policy", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  getMemories: async (citizenId: string) => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionMemories(citizenId);
    return request<Memory[]>(`/citizens/${citizenId}/memories`);
  },
  getRelationships: async (citizenId: string) => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionRelationships(citizenId);
    return request<Relationship[]>(`/citizens/${citizenId}/relationships`);
  },
  getConversations: async (citizenId: string) => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionConversations(citizenId);
    return request<Conversation[]>(`/citizens/${citizenId}/conversations`);
  },
  assignTask: async (citizenId: string, payload: AssignTaskPayload) => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionAssignTask(citizenId, payload, generateSessionTaskPlan);
    return request<CityState>(`/citizens/${citizenId}/task`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  closeTask: async (citizenId: string) => {
    if (sessionMemoryEnabled() && getSessionCity()) return sessionCloseTask(citizenId);
    return request<CityState>(`/citizens/${citizenId}/task/close`, {
      method: "POST",
    });
  },
};

async function generateSessionCognition(requestBody: SessionCognitionRequest): Promise<SessionCognitionResponse> {
  return request<SessionCognitionResponse>("/cognition/session", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

async function generateSessionTaskPlan(requestBody: SessionTaskPlanRequest): Promise<SessionTaskPlanResponse> {
  return request<SessionTaskPlanResponse>("/cognition/task-plan", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}
