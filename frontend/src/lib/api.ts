import type {
  AssignTaskPayload,
  CityState,
  Conversation,
  MayorPolicyPayload,
  Memory,
  Relationship,
  TriggerEventPayload,
} from "@/lib/types";

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
  getState: () => request<CityState>("/city/state"),
  getCityConversations: () => request<Conversation[]>("/city/conversations"),
  start: () => request<CityState>("/simulation/start", { method: "POST" }),
  pause: () => request<CityState>("/simulation/pause", { method: "POST" }),
  tick: () => request<CityState>("/simulation/tick", { method: "POST" }),
  triggerEvent: (payload: TriggerEventPayload) =>
    request<CityState>("/events/trigger", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  applyPolicy: (payload: MayorPolicyPayload) =>
    request<CityState>("/mayor/policy", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getMemories: (citizenId: string) => request<Memory[]>(`/citizens/${citizenId}/memories`),
  getRelationships: (citizenId: string) =>
    request<Relationship[]>(`/citizens/${citizenId}/relationships`),
  getConversations: (citizenId: string) =>
    request<Conversation[]>(`/citizens/${citizenId}/conversations`),
  assignTask: (citizenId: string, payload: AssignTaskPayload) =>
    request<CityState>(`/citizens/${citizenId}/task`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
