"use client";

import { create } from "zustand";

import { API_URL, api } from "@/lib/api";
import type {
  CityEvent,
  CityState,
  CitizenAgent,
  Memory,
  Relationship,
  TimelineItem,
  WebSocketEnvelope,
} from "@/lib/types";

function resolveWebSocketUrl() {
  const configured = process.env.NEXT_PUBLIC_WS_URL;
  if (configured) return configured;
  if (typeof window === "undefined") return "ws://localhost:8000/ws/city";
  if (API_URL.startsWith("http://") || API_URL.startsWith("https://")) {
    const url = new URL(API_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = `${url.pathname.replace(/\/$/, "")}/ws/city`;
    return url.toString();
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${API_URL.replace(/\/$/, "")}/ws/city`;
}

type GameStore = {
  city: CityState | null;
  selectedCitizenId: string | null;
  timeline: TimelineItem[];
  memories: Memory[];
  relationships: Relationship[];
  connectionStatus: "idle" | "connecting" | "connected" | "offline";
  error: string | null;
  setCity: (city: CityState) => void;
  selectCitizen: (citizenId: string) => Promise<void>;
  loadInitialState: () => Promise<void>;
  connectWebSocket: () => WebSocket;
  appendTimeline: (item: TimelineItem) => void;
};

function gameTime(city: CityState | null) {
  if (!city) return "--:--";
  const hour = Math.floor(city.clock.minute_of_day / 60);
  const minute = city.clock.minute_of_day % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function eventToTimeline(event: CityEvent): TimelineItem {
  const hour = Math.floor(event.game_minute / 60);
  const minute = event.game_minute % 60;
  return {
    id: event.event_id,
    type: event.event_type,
    time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
    text: event.description,
    priority: event.priority,
  };
}

function updateCitizens(city: CityState, citizens: CitizenAgent[]) {
  return {
    ...city,
    citizens,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  city: null,
  selectedCitizenId: null,
  timeline: [],
  memories: [],
  relationships: [],
  connectionStatus: "idle",
  error: null,
  setCity: (city) =>
    set({
      city,
      timeline: city.events.slice(-40).map(eventToTimeline).reverse(),
      error: null,
    }),
  appendTimeline: (item) =>
    set((state) => ({
      timeline: [item, ...state.timeline].slice(0, 80),
    })),
  selectCitizen: async (citizenId) => {
    set({ selectedCitizenId: citizenId });
    const [memories, relationships] = await Promise.all([
      api.getMemories(citizenId),
      api.getRelationships(citizenId),
    ]);
    set({ memories, relationships });
  },
  loadInitialState: async () => {
    try {
      const city = await api.getState();
      get().setCity(city);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Unable to load city" });
    }
  },
  connectWebSocket: () => {
    set({ connectionStatus: "connecting" });
    const socket = new WebSocket(resolveWebSocketUrl());
    socket.onopen = () => set({ connectionStatus: "connected" });
    socket.onclose = () => set({ connectionStatus: "offline" });
    socket.onerror = () => set({ connectionStatus: "offline" });
    socket.onmessage = (event) => {
      const envelope = JSON.parse(event.data) as WebSocketEnvelope;
      const state = get();
      if (envelope.type === "city_state" && envelope.payload) {
        state.setCity(envelope.payload as CityState);
        return;
      }
      if (envelope.type === "tick" && envelope.payload) {
        const payload = envelope.payload as Partial<CityState> & { citizens?: CitizenAgent[] };
        if ("city_id" in payload) {
          state.setCity(payload as CityState);
          return;
        }
        set((current) => {
          if (!current.city || !payload.citizens) return current;
          return {
            city: {
              ...updateCitizens(current.city, payload.citizens),
              clock: payload.clock ?? current.city.clock,
              metrics: payload.metrics ?? current.city.metrics,
            },
          };
        });
      }
      if (envelope.type === "event" && envelope.payload) {
        const payload = envelope.payload as Partial<CityEvent>;
        state.appendTimeline({
          id: payload.event_id ?? `${Date.now()}-${Math.random()}`,
          type: payload.event_type ?? "event",
          time: gameTime(state.city),
          text: payload.description ?? `City event: ${payload.event_type ?? "update"}`,
          priority: payload.priority,
        });
      }
      if (["thought", "memory", "reflection", "conversation"].includes(envelope.type)) {
        const payload = envelope.payload as Record<string, unknown>;
        const text =
          (payload.thought as string) ??
          (payload.content as string) ??
          (payload.insight as string) ??
          (payload.summary as string) ??
          "Citizen cognition updated.";
        state.appendTimeline({
          id: `${envelope.type}-${Date.now()}-${Math.random()}`,
          type: envelope.type,
          time: gameTime(state.city),
          text,
          priority: envelope.type === "conversation" ? 2 : 1,
        });
        if (
          envelope.type === "memory" &&
          payload.citizen_id === state.selectedCitizenId &&
          typeof payload.memory_id === "string" &&
          typeof payload.content === "string"
        ) {
          set((current) => ({
            memories: [
              {
                memory_id: payload.memory_id as string,
                citizen_id: payload.citizen_id as string,
                kind: "episodic",
                content: payload.content as string,
                importance: Number(payload.importance ?? 0.5),
                salience: Number(payload.importance ?? 0.5),
                related_citizen_id: null,
                source_event_id: null,
                extra: {},
                created_at: new Date().toISOString(),
              },
              ...current.memories,
            ].slice(0, 80),
          }));
        }
      }
    };
    return socket;
  },
}));
